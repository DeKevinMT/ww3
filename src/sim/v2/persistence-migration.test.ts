import { describe, expect, it } from 'vitest';
import { WorldEngineV2 } from './WorldEngineV2';
import {
  V2_CONTENT_VERSION,
  V2_RULES_VERSION,
  WAR_CAMPAIGN_MAX_TICKS,
  WAR_REVENGE_WINDOW_TICKS,
  round,
} from './balance';
import { createWorldStateV2 } from './bootstrap';
import { stateTerritoryArmyCapacityTargetV2, synchronizeArmyCapacityV2 } from './capacity';
import {
  ANTARCTIC_TERRITORY_IDS_V2,
  ROGUE_AI_NATION_ID_V2,
  WORLD_CONTENT_V2,
  type WorldContentV2,
} from './content';
import {
  beginTerritoryIntegrationV2,
  INTEGRATION_DURATION_MULTIPLIER_V2,
  territoryIntegrationAnnualCostV2,
  territoryIntegrationDurationWeeksV2,
} from './integration';
import { canonicalStateHashV2, createSaveV2, loadSaveV2 } from './persistence';
import { createInitialPolarEndgameV2 } from './polarEndgame';
import { synchronizeOpeningArmyHumanRosterV2 } from './nationState';
import { OPENING_ARMY_BONUS_DURATION_TICKS_V2 } from './openingArmyBonus';
import { createRandomWorldContentV2 } from './randomWorld';
import {
  invalidateTerritoryIndexV2,
} from './selectors';
import { selectNorthPoleModifiersV2 } from './northPoleModifiers';
import { resolveScenarioV2 } from './scenarios';
import { nationIdV2, territoryIdV2 } from './types';

const LEGACY_CONTENT_VERSION_V16 = 'natural-earth-countries-2026-v6-naval';
const LEGACY_RULES_VERSION_V22_76 = 'frontier-command-v2.76-logistics-readiness';
const LEGACY_RULES_VERSION_V22_77 = 'frontier-command-v2.77-apex-shield-multipliers';
const LEGACY_RULES_VERSION_V22_78 = 'frontier-command-v2.78-rogue-perimeter-balance';
const LEGACY_RULES_VERSION_V22_79 = 'frontier-command-v2.79-active-research';

function removeSchema22Fields(save: Record<string, any>): void {
  delete save.commanderForces;
  delete save.alliances;
  delete save.allianceOffers;
  delete save.firstIntegrationDiscountUsedBy;
  delete save.polarEndgame;
  delete save.runProgression;
  for (const nation of Object.values(save.players) as Array<Record<string, any>>) {
    delete nation.openingArmyBonus;
  }
  for (const war of save.wars as Array<Record<string, any>>) delete war.revenge;
}

function legacySaveV16(seed: number): Record<string, any> {
  const state = createWorldStateV2(seed);
  synchronizeOpeningArmyHumanRosterV2(state, WORLD_CONTENT_V2, state.humanPlayerIds, []);
  const current = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
  removeSchema22Fields(current);
  delete current.humanPlayerIds;
  current.schemaVersion = 16;
  current.rulesVersion = 'frontier-command-v2.51-fixed-manual-actions';
  current.contentVersion = LEGACY_CONTENT_VERSION_V16;
  for (const nation of Object.values(current.players) as Array<Record<string, any>>) {
    delete nation.combatExperience;
    delete nation.domesticFoodCapacity;
    delete nation.trainedReserves;
  }
  for (const territory of Object.values(current.territories) as Array<Record<string, any>>) {
    delete territory.coreOwner;
    delete territory.integrationProgram;
    territory.condition = 1;
    territory.army.veteranManpower = 0;
    territory.army.veteranExperience = 0;
  }
  const denmark = current.territories.dnk;
  const greenland = current.territories.grl;
  denmark.population += greenland.population;
  denmark.economy += greenland.economy;
  denmark.army.manpower += greenland.army.manpower;
  denmark.army.capacity += greenland.army.capacity;
  denmark.army.veteranManpower += greenland.army.veteranManpower;
  delete current.territories.grl;
  delete current.players.grl;
  current.wars = current.wars.map((war: Record<string, any>) => {
    const attackerOperation = war.attackerOperations?.[0];
    const defenderOperation = war.defenderOperations?.[0];
    delete war.attackerOperations;
    delete war.defenderOperations;
    if (attackerOperation) war.attackerOperation = attackerOperation;
    if (defenderOperation) war.defenderOperation = defenderOperation;
    return war;
  });
  current.canonicalStateHash = canonicalStateHashV2(current);
  return current;
}

function legacySaveV17(seed: number): Record<string, any> {
  const state = createWorldStateV2(seed);
  synchronizeOpeningArmyHumanRosterV2(state, WORLD_CONTENT_V2, state.humanPlayerIds, []);
  const current = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
  removeSchema22Fields(current);
  delete current.humanPlayerIds;
  current.schemaVersion = 17;
  current.rulesVersion = 'frontier-command-v2.52-integration-multifront';
  for (const nation of Object.values(current.players) as Array<Record<string, any>>) {
    delete nation.combatExperience;
    delete nation.domesticFoodCapacity;
    delete nation.trainedReserves;
  }
  for (const territory of Object.values(current.territories) as Array<Record<string, any>>) {
    delete territory.coreOwner;
    delete territory.integrationProgram;
    territory.condition = 1;
    territory.army.veteranManpower = 0;
    territory.army.veteranExperience = 0;
  }
  current.canonicalStateHash = canonicalStateHashV2(current);
  return current;
}

function legacySaveV19(seed: number): Record<string, any> {
  const state = createWorldStateV2(seed);
  synchronizeOpeningArmyHumanRosterV2(state, WORLD_CONTENT_V2, state.humanPlayerIds, []);
  const current = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
  removeSchema22Fields(current);
  delete current.humanPlayerIds;
  current.schemaVersion = 19;
  current.rulesVersion = 'frontier-command-v2.54-faster-integration';
  for (const nation of Object.values(current.players) as Array<Record<string, any>>) {
    delete nation.trainedReserves;
    nation.combatExperience = 7.25;
  }
  for (const territory of Object.values(current.territories) as Array<Record<string, any>>) {
    territory.condition = 1;
  }
  current.canonicalStateHash = canonicalStateHashV2(current);
  return current;
}

function legacySaveV13(): Record<string, any> {
  const current = legacySaveV16(91);
  current.schemaVersion = 13;
  current.rulesVersion = 'frontier-command-v2.48-canonical-tax';
  for (const nation of Object.values(current.players) as Array<Record<string, any>>) {
    delete nation.manualActionUses;
    nation.battleBots = {
      unlocked: false,
      researchProgress: 0,
      technologyLevel: 0,
      capacityProgress: 0,
      productionProgress: 0,
    };
  }
  for (const territory of Object.values(current.territories) as Array<Record<string, any>>) {
    territory.army = {
      manpower: territory.army.manpower,
      capacity: territory.army.capacity,
      battleBots: 0,
      battleBotCapacity: 0,
      battleBotWear: 0,
    };
  }
  const usa = nationIdV2('usa');
  const usaTerritory = territoryIdV2('usa');
  current.players[usa].battleBots = {
    unlocked: true,
    researchProgress: 0.35,
    technologyLevel: 2,
    capacityProgress: 1.5,
    productionProgress: 0.5,
  };
  current.territories[usaTerritory].army.battleBots = 2;
  current.territories[usaTerritory].army.battleBotCapacity = 3;
  current.territories[usaTerritory].army.battleBotWear = 0.01;
  // Schema 13 could lose built cap after underfunding. Migration must restore
  // the live population/research ceiling instead of preserving that damage.
  current.territories[usaTerritory].army.capacity = current.territories[usaTerritory].army.manpower;
  current.canonicalStateHash = canonicalStateHashV2(current);
  return current;
}

function legacySaveV14(): Record<string, any> {
  const current = legacySaveV16(92);
  current.schemaVersion = 14;
  current.rulesVersion = 'frontier-command-v2.49-veteran-forces';
  for (const nation of Object.values(current.players) as Array<Record<string, any>>) {
    delete nation.manualActionUses;
  }
  for (const territory of Object.values(current.territories) as Array<Record<string, any>>) {
    delete territory.army.baseAttack;
    delete territory.army.baseDefense;
  }
  current.canonicalStateHash = canonicalStateHashV2(current);
  return current;
}

function antarcticWeightShareByTerritory(content: WorldContentV2): Record<string, number> {
  const totalWeight = ANTARCTIC_TERRITORY_IDS_V2.reduce((sum, territoryId) => (
    sum + (content.territories[territoryId]?.armyCapacityWeight ?? 0)
  ), 0);
  return Object.fromEntries(ANTARCTIC_TERRITORY_IDS_V2.map((territoryId) => [
    territoryId,
    (content.territories[territoryId]?.armyCapacityWeight ?? 0) / totalWeight,
  ]));
}

function antarcticPopulationShareByTerritory(content: WorldContentV2): Record<string, number> {
  const totalPopulation = ANTARCTIC_TERRITORY_IDS_V2.reduce((sum, territoryId) => (
    sum + (content.territories[territoryId]?.baseline.population ?? 0)
  ), 0);
  return Object.fromEntries(ANTARCTIC_TERRITORY_IDS_V2.map((territoryId) => [
    territoryId,
    (content.territories[territoryId]?.baseline.population ?? 0) / totalPopulation,
  ]));
}

function totalAntarcticBaseManpower(save: Record<string, any>): number {
  return round(ANTARCTIC_TERRITORY_IDS_V2.reduce((sum, territoryId) => (
    sum
      + (save.territories[territoryId]?.army.manpower ?? 0)
      - (save.polarEndgame?.rogueWaveManpowerByTerritory?.[territoryId] ?? 0)
  ), 0), 9);
}

function totalAntarcticManpower(save: Record<string, any>): number {
  return round(ANTARCTIC_TERRITORY_IDS_V2.reduce((sum, territoryId) => (
    sum + (save.territories[territoryId]?.army.manpower ?? 0)
  ), 0), 9);
}

function applyLegacyAntarcticPopulationDistribution(
  save: Record<string, any>,
  content: WorldContentV2,
): void {
  const shares = antarcticPopulationShareByTerritory(content);
  const totalBaseManpower = totalAntarcticBaseManpower(save);
  let assigned = 0;
  ANTARCTIC_TERRITORY_IDS_V2.forEach((territoryId, index) => {
    const wave = save.polarEndgame?.rogueWaveManpowerByTerritory?.[territoryId] ?? 0;
    const base = index === ANTARCTIC_TERRITORY_IDS_V2.length - 1
      ? round(totalBaseManpower - assigned, 9)
      : round(totalBaseManpower * shares[territoryId]!, 9);
    assigned = round(assigned + base, 9);
    save.territories[territoryId].army.manpower = round(wave + base, 9);
  });
}

function createLegacyAntarcticRedistributionSave(
  state: ReturnType<typeof createWorldStateV2>,
  content: WorldContentV2,
  rulesVersion: string,
): Record<string, any> {
  const legacy = structuredClone(createSaveV2(state, content)) as Record<string, any>;
  legacy.rulesVersion = rulesVersion;
  applyLegacyAntarcticPopulationDistribution(legacy, content);
  legacy.canonicalStateHash = canonicalStateHashV2(legacy);
  return legacy;
}

describe('V2 legacy save migration', () => {
  it('retires the exact four-project Polar payouts before applying the bounded fourteen-stage curve', () => {
    const state = createWorldStateV2(8_674, WORLD_CONTENT_V2);
    const playerId = state.humanPlayerId;
    const legacy = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    legacy.rulesVersion = 'frontier-command-v2.73-apex-finance';
    legacy.polarEndgame.arcticPrograms[playerId] = {
      playerId,
      activeProject: null,
      completedProjects: [
        'polar-demography',
        'cryogenic-logistics',
        'strategic-mobilisation',
        'deep-ice-signals',
      ],
    };
    const levels = legacy.players[playerId].research.effectLevels;
    Object.assign(levels, {
      'population-growth': 4,
      recovery: 5,
      'food-storage': 7,
      supply: 5,
      'casualty-reduction': 4,
      'research-efficiency': 5,
      'force-capacity': 6,
      'reserve-training': 8,
      'reserve-mobilization': 9,
      attack: 4,
      defense: 5,
      'research-speed': 10,
    });
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    expect(loaded.players[playerId].research.effectLevels).toMatchObject({
      'population-growth': 3,
      recovery: 10,
      'food-storage': 0,
      supply: 3,
      'casualty-reduction': 3,
      'research-efficiency': 4,
      // The authenticated legacy payouts first step down by two, then migrate
      // once into their direct active-army replacements.
      'force-capacity': 11,
      training: 6,
      'reserve-training': 0,
      'reserve-mobilization': 0,
      attack: 3,
      defense: 4,
      'research-speed': 9,
    });
    expect(loaded.polarEndgame.arcticPrograms[playerId]?.completedProjects)
      .toHaveLength(14);
    expect(selectNorthPoleModifiersV2(loaded, playerId)).toMatchObject({
      researchOutputMultiplier: 1.0025,
      supplyThroughputMultiplier: 1.005,
      signalPurgeDurationMultiplier: 0.92,
      recoveryMultiplier: 1.02,
      attackVsRogueMultiplier: 1.04,
      defenseVsRogueMultiplier: 1.06,
      antarcticSupplyMultiplier: 1.08,
      antarcticOperationMultiplier: 1.05,
    });

    const loadedAgain = loadSaveV2(createSaveV2(loaded, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(loadedAgain.players[playerId].research.effectLevels)
      .toEqual(loaded.players[playerId].research.effectLevels);
  });

  it('hydrates the v8 Rogue empire and extends only legacy three-year campaigns', () => {
    const belgium = nationIdV2('bel');
    const netherlands = nationIdV2('nld');
    const state = createWorldStateV2(8_660);
    state.tick = 40;
    state.players[belgium].treasury = 432.125;
    state.wars.push({
      id: 'war-v266-window',
      attackerId: belgium,
      defenderId: netherlands,
      startedTick: 12,
      lastBattleTick: 38,
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
      campaign: {
        attackerObjective: 1,
        defenderObjective: 1,
        attackerCaptures: 0,
        defenderCaptures: 0,
        consolidationUntilTick: 12,
        expiresTick: 12 + WAR_CAMPAIGN_MAX_TICKS,
      },
    });
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const legacy = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    delete legacy.players[ROGUE_AI_NATION_ID_V2];
    for (const territoryId of ANTARCTIC_TERRITORY_IDS_V2) delete legacy.territories[territoryId];
    legacy.contentVersion = 'natural-earth-countries-2026-v7-greenland';
    delete legacy.commanderForces;
    delete legacy.runProgression;
    legacy.rulesVersion = 'frontier-command-v2.66-strategic-rebalance';
    legacy.wars[0].campaign.expiresTick = legacy.wars[0].startedTick + 156;
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);

    expect(loaded.contentVersion).toBe(V2_CONTENT_VERSION);
    expect(loaded.players[ROGUE_AI_NATION_ID_V2]).toBeDefined();
    expect(ANTARCTIC_TERRITORY_IDS_V2.every((id) => Boolean(loaded.territories[id]))).toBe(true);
    expect(loaded.players[belgium].treasury).toBe(432.125);
    expect(loaded.wars[0]?.campaign?.expiresTick)
      .toBe(loaded.wars[0]!.startedTick + WAR_CAMPAIGN_MAX_TICKS);
    expect(loaded.polarEndgame.phase).toBe('dormant');
    expect(() => createSaveV2(loaded, WORLD_CONTENT_V2)).not.toThrow();
  });

  it('leaves current campaign horizons untouched during v2.66 migration', () => {
    const state = createWorldStateV2(8_661);
    const legacy = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    const customStartedTick = 10;
    const customExpiresTick = customStartedTick + WAR_CAMPAIGN_MAX_TICKS;
    legacy.wars.push({
      id: 'war-v266-current-window',
      attackerId: 'bel',
      defenderId: 'nld',
      startedTick: customStartedTick,
      lastBattleTick: customStartedTick,
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
      campaign: {
        attackerObjective: 1,
        defenderObjective: 1,
        attackerCaptures: 0,
        defenderCaptures: 0,
        consolidationUntilTick: customStartedTick,
        expiresTick: customExpiresTick,
      },
    });
    delete legacy.commanderForces;
    delete legacy.runProgression;
    legacy.rulesVersion = 'frontier-command-v2.66-strategic-rebalance';
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    expect(loaded.wars[0]?.campaign?.expiresTick).toBe(customExpiresTick);
  });

  it('authenticates complete V2.65 schema-22 saves for standard and alternative content', () => {
    const fixtures = [
      { seed: 8_650, content: WORLD_CONTENT_V2 },
      { seed: 8_651, content: createRandomWorldContentV2(8_651) },
    ];

    for (const { seed, content } of fixtures) {
      const state = createWorldStateV2(seed, content);
      const humanPlayerId = state.humanPlayerId;
      const legacy = structuredClone(createSaveV2(state, content)) as Record<string, any>;
      const openingBonusBefore = structuredClone(legacy.players[humanPlayerId].openingArmyBonus);
      const deployedBefore = Object.values(legacy.territories)
        .filter((territory: any) => territory.owner === humanPlayerId)
        .reduce((sum: number, territory: any) => sum + territory.army.manpower, 0);
      delete legacy.commanderForces;
      delete legacy.runProgression;
      legacy.rulesVersion = 'frontier-command-v2.65-polar-endgame';
      legacy.canonicalStateHash = canonicalStateHashV2(legacy);

      const loaded = loadSaveV2(legacy as never, content);
      const deployedAfter = Object.values(loaded.territories)
        .filter((territory) => territory.owner === humanPlayerId)
        .reduce((sum, territory) => sum + territory.army.manpower, 0);
      expect(loaded.rulesVersion).toBe(V2_RULES_VERSION);
      expect(loaded.contentVersion).toBe(state.contentVersion);
      expect(loaded.polarEndgame).toEqual(state.polarEndgame);
      expect(loaded.players[humanPlayerId]!.openingArmyBonus).toEqual(openingBonusBefore);
      expect(deployedAfter).toBeCloseTo(deployedBefore, 9);

      const current = createSaveV2(loaded, content);
      expect(current.rulesVersion).toBe(V2_RULES_VERSION);
      expect(createSaveV2(loadSaveV2(current, content), content)).toEqual(current);
    }
  });

  it('normalizes same-schema polar saves made before final-strike commander credit', () => {
    const state = createWorldStateV2(8_641);
    const legacy = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    delete legacy.polarEndgame.victoryCommanderId;
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    expect(loaded.polarEndgame.victoryCommanderId).toBeNull();
    expect(() => createSaveV2(loaded, WORLD_CONTENT_V2)).not.toThrow();
  });

  it('authenticates a V2.64 pre-polar save, initializes a dormant campaign and round-trips it', () => {
    const state = createWorldStateV2(8_640);
    const legacy = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    delete legacy.polarEndgame;
    delete legacy.commanderForces;
    delete legacy.runProgression;
    legacy.rulesVersion = 'frontier-command-v2.64-war-strain-counterattacks';
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const migrated = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    expect(migrated.rulesVersion).toBe(V2_RULES_VERSION);
    expect(migrated.polarEndgame).toEqual(createInitialPolarEndgameV2());

    const current = createSaveV2(migrated, WORLD_CONTENT_V2);
    const reloaded = loadSaveV2(current, WORLD_CONTENT_V2);
    expect(createSaveV2(reloaded, WORLD_CONTENT_V2)).toEqual(current);
  });

  it('extends authenticated legacy opening pools to 1,560 daily ticks without granting manpower', () => {
    const greenland = nationIdV2('grl');
    const state = createWorldStateV2(8_642);
    synchronizeOpeningArmyHumanRosterV2(
      state,
      WORLD_CONTENT_V2,
      state.humanPlayerIds,
      [greenland],
    );
    state.humanPlayerId = greenland;
    state.humanPlayerIds = [greenland];
    state.tick = 137;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const legacy = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    const legacyBonus = legacy.players[greenland].openingArmyBonus;
    expect(legacyBonus).not.toBeNull();
    legacyBonus.expiresTick = legacyBonus.startedTick + 1_040;
    const remainingBefore = legacyBonus.remainingManpower;
    const deployedBefore = Object.values(legacy.territories)
      .filter((territory: any) => territory.owner === greenland)
      .reduce((sum: number, territory: any) => sum + territory.army.manpower, 0);
    delete legacy.polarEndgame;
    delete legacy.commanderForces;
    delete legacy.runProgression;
    legacy.rulesVersion = 'frontier-command-v2.64-war-strain-counterattacks';
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    const loadedBonus = loaded.players[greenland]!.openingArmyBonus!;
    const deployedAfter = Object.values(loaded.territories)
      .filter((territory) => territory.owner === greenland)
      .reduce((sum, territory) => sum + territory.army.manpower, 0);
    expect(loadedBonus.expiresTick - loadedBonus.startedTick)
      .toBe(OPENING_ARMY_BONUS_DURATION_TICKS_V2);
    expect(loadedBonus.remainingManpower).toBe(remainingBefore);
    expect(deployedAfter).toBeCloseTo(deployedBefore, 9);
    expect(() => createSaveV2(loaded, WORLD_CONTENT_V2)).not.toThrow();
  });

  it('authenticates schema-22 V2.59 saves before upgrading their rules version', () => {
    const state = createWorldStateV2(8_590);
    synchronizeOpeningArmyHumanRosterV2(state, WORLD_CONTENT_V2, state.humanPlayerIds, []);
    state.tick = 37;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const legacy = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    delete legacy.firstIntegrationDiscountUsedBy;
    delete legacy.polarEndgame;
    delete legacy.commanderForces;
    delete legacy.runProgression;
    legacy.rulesVersion = 'frontier-command-v2.59-country-traits';
    for (const nation of Object.values(legacy.players) as Array<Record<string, any>>) {
      delete nation.openingArmyBonus;
    }
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    expect(loaded.schemaVersion).toBe(22);
    expect(loaded.rulesVersion).toBe(V2_RULES_VERSION);
    expect(loaded.tick).toBe(37);
    expect(createSaveV2(loaded, WORLD_CONTENT_V2).rulesVersion).toBe(V2_RULES_VERSION);
  });

  it('rehydrates derived Greenland capacity after authenticating a V2.59 save', () => {
    const greenland = nationIdV2('grl');
    const greenlandTerritory = territoryIdV2('grl');
    const state = createWorldStateV2(8_591);
    synchronizeOpeningArmyHumanRosterV2(state, WORLD_CONTENT_V2, state.humanPlayerIds, []);
    state.humanPlayerId = greenland;
    state.humanPlayerIds = [greenland];
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const legacy = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    delete legacy.firstIntegrationDiscountUsedBy;
    delete legacy.polarEndgame;
    delete legacy.commanderForces;
    delete legacy.runProgression;
    legacy.rulesVersion = 'frontier-command-v2.59-country-traits';
    for (const nation of Object.values(legacy.players) as Array<Record<string, any>>) {
      delete nation.openingArmyBonus;
    }
    const obsoleteCapacity = legacy.territories[greenlandTerritory].army.manpower;
    legacy.territories[greenlandTerritory].army.capacity = obsoleteCapacity;
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    expect(loaded.territories[greenlandTerritory]!.army.capacity).toBeCloseTo(
      stateTerritoryArmyCapacityTargetV2(
        loaded,
        WORLD_CONTENT_V2,
        greenlandTerritory,
        greenland,
      ),
      9,
    );
    expect(loaded.territories[greenlandTerritory]!.army.capacity).toBeGreaterThan(obsoleteCapacity);
  });

  it('migrates schema 21 alliance defaults and canonically round-trips revenge state', () => {
    const state = createWorldStateV2(85);
    const belgium = nationIdV2('bel');
    const canada = nationIdV2('can');
    state.tick = 10;
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    state.wars.push({
      id: 'war-schema-21-migration',
      attackerId: belgium,
      defenderId: canada,
      startedTick: 2,
      lastBattleTick: 8,
      warScore: 0,
      battles: 0,
      attackerLosses: 0,
      defenderLosses: 0,
      attackerCivilianLosses: 0,
      defenderCivilianLosses: 0,
      lastPeaceOfferTick: -1_000_000,
      attackerOperations: [],
      defenderOperations: [],
      revenge: {
        claimantId: belgium,
        triggeredTick: state.tick,
        expiresTick: state.tick + WAR_REVENGE_WINDOW_TICKS,
      },
    });

    const current = createSaveV2(state, WORLD_CONTENT_V2);
    const reloaded = loadSaveV2(current, WORLD_CONTENT_V2);
    expect(reloaded.wars[0]?.revenge).toEqual(state.wars[0]?.revenge);

    const malformed = structuredClone(current) as Record<string, any>;
    malformed.wars[0].revenge = false;
    malformed.canonicalStateHash = canonicalStateHashV2(malformed);
    expect(() => loadSaveV2(malformed as never, WORLD_CONTENT_V2))
      .toThrow(/invalid revenge state/i);

    const legacy = structuredClone(current) as Record<string, any>;
    removeSchema22Fields(legacy);
    legacy.schemaVersion = 21;
    legacy.rulesVersion = 'frontier-command-v2.57-performance-multiplayer';
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const migrated = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    expect(migrated.schemaVersion).toBe(22);
    expect(migrated.rulesVersion).toBe(V2_RULES_VERSION);
    expect(migrated.alliances).toEqual([]);
    expect(migrated.allianceOffers).toEqual([]);
    expect(migrated.wars[0]?.revenge).toBeNull();
  });

  it('authenticates schema 19 and permanently retires Combat Experience', () => {
    const legacy = legacySaveV19(86);
    const belgium = nationIdV2('bel');

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    expect(loaded.schemaVersion).toBe(22);
    expect(loaded.rulesVersion).toBe(V2_RULES_VERSION);
    expect(loaded.players[belgium]).not.toHaveProperty('combatExperience');
    expect(Object.values(loaded.players).every((nation) => nation.trainedReserves === 0)).toBe(true);

    const reloaded = loadSaveV2(createSaveV2(loaded, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(reloaded.players[belgium]).not.toHaveProperty('combatExperience');
  });

  it('preserves an active schema 19 integration share and promised endpoint across migration and roundtrip', () => {
    const state = createWorldStateV2(87);
    const belgium = nationIdV2('bel');
    const luxembourgTerritory = territoryIdV2('lux');
    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, luxembourgTerritory, belgium);
    state.tick = 200;
    state.territories[luxembourgTerritory].integration = 0.55;
    const promisedEndpoint = state.tick + 321;
    state.territories[luxembourgTerritory].integrationProgram!.completesTick = promisedEndpoint;
    invalidateTerritoryIndexV2(state);
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);

    const legacy = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    removeSchema22Fields(legacy);
    legacy.schemaVersion = 19;
    delete legacy.humanPlayerIds;
    legacy.rulesVersion = 'frontier-command-v2.54-faster-integration';
    for (const nation of Object.values(legacy.players) as Array<Record<string, any>>) {
      delete nation.trainedReserves;
      nation.combatExperience = 7.25;
    }
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    expect(loaded.territories[luxembourgTerritory].integration).toBe(0.55);
    expect(loaded.territories[luxembourgTerritory].integrationProgram?.completesTick)
      .toBe(promisedEndpoint);

    const reloaded = loadSaveV2(createSaveV2(loaded, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(reloaded.territories[luxembourgTerritory].integration).toBe(0.55);
    expect(reloaded.territories[luxembourgTerritory].integrationProgram?.completesTick)
      .toBe(promisedEndpoint);
  });

  it('rejects Combat Experience when it is injected into a current schema save', () => {
    const current = structuredClone(
      createSaveV2(createWorldStateV2(8_601), WORLD_CONTENT_V2),
    ) as Record<string, any>;
    current.players[nationIdV2('bel')].combatExperience = 7.25;
    current.canonicalStateHash = canonicalStateHashV2(current);

    expect(() => loadSaveV2(current as never, WORLD_CONTENT_V2))
      .toThrow(/non-canonical keys/i);
  });

  it('authenticates v2.74 land condition before stripping it into the v2.75 schema', () => {
    const state = createWorldStateV2(8_600_74);
    const belgium = nationIdV2('bel');
    const belgiumTerritory = territoryIdV2('bel');
    state.players[belgium].treasury = 123.456789;
    const legacy = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    legacy.rulesVersion = 'frontier-command-v2.74-shared-apex-economy';
    for (const [id, territory] of Object.entries(legacy.territories) as Array<[string, Record<string, any>]>) {
      territory.condition = id === belgiumTerritory ? 0.42 : 1;
    }
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    expect(loaded.rulesVersion).toBe(V2_RULES_VERSION);
    expect(loaded.tick).toBe(state.tick);
    expect(loaded.players[belgium].treasury).toBe(123.456789);
    expect(Object.values(loaded.territories).every((territory) => (
      !Object.prototype.hasOwnProperty.call(territory, 'condition')
    ))).toBe(true);
    const canonical = createSaveV2(loaded, WORLD_CONTENT_V2);
    expect(Object.values(canonical.territories).every((territory) => (
      !Object.prototype.hasOwnProperty.call(territory, 'condition')
    ))).toBe(true);

    const tamperedLegacy = structuredClone(legacy);
    tamperedLegacy.territories[belgiumTerritory].condition = 0.41;
    expect(() => loadSaveV2(tamperedLegacy as never, WORLD_CONTENT_V2))
      .toThrow(/canonical hash mismatch/i);

    const missingLegacyCondition = structuredClone(legacy);
    delete missingLegacyCondition.territories[belgiumTerritory].condition;
    missingLegacyCondition.canonicalStateHash = canonicalStateHashV2(missingLegacyCondition);
    expect(() => loadSaveV2(missingLegacyCondition as never, WORLD_CONTENT_V2))
      .toThrow(/invalid land condition/i);

    const malformedLegacyCondition = structuredClone(legacy);
    malformedLegacyCondition.territories[belgiumTerritory].condition = 'healthy';
    malformedLegacyCondition.canonicalStateHash = canonicalStateHashV2(malformedLegacyCondition);
    expect(() => loadSaveV2(malformedLegacyCondition as never, WORLD_CONTENT_V2))
      .toThrow(/invalid land condition/i);

    const malformedCurrent = structuredClone(canonical) as Record<string, any>;
    malformedCurrent.territories[belgiumTerritory].condition = 0.42;
    malformedCurrent.canonicalStateHash = canonicalStateHashV2(malformedCurrent);
    expect(() => loadSaveV2(malformedCurrent as never, WORLD_CONTENT_V2))
      .toThrow(/non-canonical keys/i);
  });

  it('requires the zeroed reserve compatibility key in current saves and canonical hashes', () => {
    const state = createWorldStateV2(8_602);
    const belgium = nationIdV2('bel');
    state.players[belgium].trainedReserves = 0;
    const save = createSaveV2(state, WORLD_CONTENT_V2);
    const loaded = loadSaveV2(save, WORLD_CONTENT_V2);
    expect(loaded.players[belgium].trainedReserves).toBe(0);
    expect(createSaveV2(loaded, WORLD_CONTENT_V2).canonicalStateHash)
      .toBe(save.canonicalStateHash);

    const missing = structuredClone(save) as Record<string, any>;
    delete missing.players[belgium].trainedReserves;
    missing.canonicalStateHash = canonicalStateHashV2(missing);
    expect(loadSaveV2(missing as never, WORLD_CONTENT_V2)
      .players[belgium].trainedReserves).toBe(0);

    const leakedLegacy = legacySaveV19(8_603);
    leakedLegacy.players[belgium].trainedReserves = 1;
    leakedLegacy.canonicalStateHash = canonicalStateHashV2(leakedLegacy);
    expect(() => loadSaveV2(leakedLegacy as never, WORLD_CONTENT_V2))
      .toThrow(/non-canonical Combat Experience state/i);
  });

  it('authenticates an old same-schema commodity field before retiring it to neutral', () => {
    const state = createWorldStateV2(87);
    const belgium = nationIdV2('bel');
    const oldCurrent = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    delete oldCurrent.players[belgium].domesticFoodCapacity;
    oldCurrent.canonicalStateHash = canonicalStateHashV2(oldCurrent);

    const loaded = loadSaveV2(oldCurrent as never, WORLD_CONTENT_V2);
    expect(loaded.players[belgium].domesticFoodCapacity).toBe(0);
    expect(loaded.players[belgium].foodStock).toBe(0);
    expect(loaded.players[belgium].foodSecurity).toBe(1);
    const reloaded = loadSaveV2(createSaveV2(loaded, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(reloaded.players[belgium].domesticFoodCapacity)
      .toBe(loaded.players[belgium].domesticFoodCapacity);
  });

  it('freezes a quote for an authenticated current save created before integration costs existed', () => {
    const state = createWorldStateV2(88);
    const bel = nationIdV2('bel');
    const luxTerritory = territoryIdV2('lux');
    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, luxTerritory, bel);
    invalidateTerritoryIndexV2(state);
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const expectedAnnualCost = territoryIntegrationAnnualCostV2(
      state.territories[luxTerritory].economy,
    );
    const oldCurrent = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    delete oldCurrent.territories[luxTerritory].integrationProgram.annualCost;
    oldCurrent.canonicalStateHash = canonicalStateHashV2(oldCurrent);

    const loaded = loadSaveV2(oldCurrent as never, WORLD_CONTENT_V2);
    expect(loaded.territories[luxTerritory].integrationProgram?.annualCost)
      .toBeCloseTo(expectedAnnualCost, 8);

    loaded.territories[luxTerritory].economy *= 2;
    const reloaded = loadSaveV2(createSaveV2(loaded, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(reloaded.territories[luxTerritory].integrationProgram?.annualCost)
      .toBeCloseTo(expectedAnnualCost, 8);
  });

  it('shortens a schema 18 integration promise exactly once without changing its current share', () => {
    const state = createWorldStateV2(89);
    const bel = nationIdV2('bel');
    const lux = nationIdV2('lux');
    const luxTerritory = territoryIdV2('lux');
    const newDuration = territoryIntegrationDurationWeeksV2(WORLD_CONTENT_V2, luxTerritory);
    const migratedRemainingDuration = Math.ceil(newDuration / 2);
    const schema18RemainingDuration = Math.round(
      newDuration / INTEGRATION_DURATION_MULTIPLIER_V2,
    );
    beginTerritoryIntegrationV2(state, WORLD_CONTENT_V2, luxTerritory, bel);
    invalidateTerritoryIndexV2(state);
    state.tick = 200;
    state.territories[luxTerritory].integration = 0.55;
    state.territories[luxTerritory].integrationProgram = {
      fromOwnerId: lux,
      fromCoreOwnerId: lux,
      toOwnerId: bel,
      startedTick: 0,
      completesTick: state.tick + migratedRemainingDuration,
      annualCost: territoryIntegrationAnnualCostV2(state.territories[luxTerritory].economy),
    };
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const legacy = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    removeSchema22Fields(legacy);
    legacy.schemaVersion = 18;
    delete legacy.humanPlayerIds;
    legacy.rulesVersion = 'frontier-command-v2.53-combat-experience';
    for (const nation of Object.values(legacy.players) as Array<Record<string, any>>) {
      delete nation.domesticFoodCapacity;
      delete nation.trainedReserves;
      nation.combatExperience = 3;
    }
    // Schema 18 used twice the base calendar; current migration applies the
    // latest immutable calendar to the exact visible remaining share.
    // Migration shortens that old promise once without moving visible progress.
    legacy.territories[luxTerritory].integrationProgram.completesTick = state.tick
      + schema18RemainingDuration;
    delete legacy.territories[luxTerritory].integrationProgram.fromOwnerId;
    delete legacy.territories[luxTerritory].integrationProgram.annualCost;
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);
    const legacyEndpoint = legacy.territories[luxTerritory].integrationProgram.completesTick;

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    const migratedProgram = loaded.territories[luxTerritory].integrationProgram!;
    expect(loaded.schemaVersion).toBe(22);
    expect(Object.values(loaded.players).every((nation) => nation.trainedReserves === 0)).toBe(true);
    expect(loaded.players[bel]).not.toHaveProperty('combatExperience');
    expect(loaded.territories[luxTerritory].integration).toBe(0.55);
    expect(migratedProgram.startedTick).toBe(0);
    expect(migratedProgram.fromOwnerId).toBe(lux);
    expect(migratedProgram.annualCost).toBeCloseTo(
      territoryIntegrationAnnualCostV2(state.territories[luxTerritory].economy),
      8,
    );
    expect(migratedProgram.completesTick).toBe(state.tick + migratedRemainingDuration);
    expect(migratedProgram.completesTick).toBeLessThan(legacyEndpoint);
    expect(legacy.territories[luxTerritory].integrationProgram.completesTick).toBe(legacyEndpoint);

    const reloaded = loadSaveV2(createSaveV2(loaded, WORLD_CONTENT_V2), WORLD_CONTENT_V2);
    expect(reloaded.territories[luxTerritory].integrationProgram?.completesTick)
      .toBe(migratedProgram.completesTick);
    expect(reloaded.territories[luxTerritory].integration).toBe(0.55);
  });

  it('retires schema 17 veteran cohorts without changing canonical armies', () => {
    const legacy = legacySaveV17(90);
    const bel = nationIdV2('bel');
    const belTerritory = territoryIdV2('bel');
    const luxTerritory = territoryIdV2('lux');
    legacy.territories[luxTerritory].owner = bel;
    legacy.territories[luxTerritory].integration = 0.55;
    legacy.territories[belTerritory].army.veteranManpower = legacy.territories[belTerritory].army.manpower * 0.5;
    legacy.territories[belTerritory].army.veteranExperience = 9;
    legacy.territories[luxTerritory].army.veteranManpower = legacy.territories[luxTerritory].army.manpower * 0.25;
    legacy.territories[luxTerritory].army.veteranExperience = 4;
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    expect(loaded.schemaVersion).toBe(22);
    expect(Object.values(loaded.players).every((nation) => nation.trainedReserves === 0)).toBe(true);
    expect(loaded.players[bel]).not.toHaveProperty('combatExperience');
    expect(loaded.territories[belTerritory].army).not.toHaveProperty('veteranManpower');
    expect(loaded.territories[luxTerritory].coreOwner).toBe(nationIdV2('lux'));
    expect(loaded.territories[luxTerritory].integrationProgram).toMatchObject({
      fromOwnerId: nationIdV2('lux'),
      fromCoreOwnerId: nationIdV2('lux'),
      toOwnerId: bel,
      startedTick: legacy.tick,
    });
    expect(loaded.territories[luxTerritory].integrationProgram!.completesTick).toBeGreaterThan(legacy.tick);
  });

  it('authenticates and retires legacy Battle Bots and veteran fields', () => {
    const legacy = legacySaveV13();
    const usa = nationIdV2('usa');
    const usaTerritory = territoryIdV2('usa');
    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    expect(loaded.schemaVersion).toBe(22);
    expect(Object.values(loaded.players).every((nation) => nation.trainedReserves === 0)).toBe(true);
    expect(loaded.rulesVersion).toBe(V2_RULES_VERSION);
    expect(loaded.players[usa]).not.toHaveProperty('battleBots');
    expect(Object.keys(loaded.territories[usaTerritory].army).sort()).toEqual([
      'baseAttack', 'baseDefense', 'capacity', 'manpower',
    ]);
    expect(loaded.territories[usaTerritory].army.manpower).toBeLessThanOrEqual(
      loaded.territories[usaTerritory].army.capacity,
    );
    expect(loaded.players[usa]).not.toHaveProperty('combatExperience');
    expect(loaded.territories[usaTerritory].army.baseAttack).toBe(
      WORLD_CONTENT_V2.nations[usa].militaryAttackRating,
    );
    expect(loaded.territories[usaTerritory].army.baseDefense).toBe(
      WORLD_CONTENT_V2.nations[usa].militaryDefenseRating,
    );
    expect(loaded.territories[usaTerritory].army.capacity).toBe(
      stateTerritoryArmyCapacityTargetV2(loaded, WORLD_CONTENT_V2, usaTerritory, usa),
    );
  });

  it('rejects legacy Bot tampering before migration can normalize it', () => {
    const legacy = legacySaveV13();
    legacy.territories[territoryIdV2('usa')].army.battleBots += 1;
    expect(() => loadSaveV2(legacy as never, WORLD_CONTENT_V2)).toThrow(/hash mismatch/);
  });

  it('migrates schema 14 armies with their exact former national blend and local empty-army quality', () => {
    const legacy = legacySaveV14();
    const bel = nationIdV2('bel');
    const belTerritory = territoryIdV2('bel');
    const luxTerritory = territoryIdV2('lux');
    const nldTerritory = territoryIdV2('nld');
    legacy.territories[luxTerritory].owner = bel;
    legacy.territories[nldTerritory].owner = bel;
    legacy.territories[luxTerritory].army.manpower = Math.min(
      Math.max(0.000001, legacy.territories[luxTerritory].army.capacity),
      Math.max(0.000001, legacy.territories[luxTerritory].army.manpower),
    );
    legacy.territories[luxTerritory].army.capacity = Math.max(
      legacy.territories[luxTerritory].army.manpower,
      legacy.territories[luxTerritory].army.capacity,
    );
    legacy.territories[luxTerritory].army.veteranManpower
      = legacy.territories[luxTerritory].army.manpower * 0.25;
    legacy.territories[luxTerritory].army.veteranExperience
      = legacy.territories[luxTerritory].army.veteranManpower > 0
        ? 1.5 : 0;
    legacy.territories[nldTerritory].army.manpower = 0;
    legacy.territories[nldTerritory].army.veteranManpower = 0;
    legacy.territories[nldTerritory].army.veteranExperience = 0;

    const ownedTerritories = [belTerritory, luxTerritory, nldTerritory];
    const weight = ownedTerritories.reduce(
      (sum, id) => sum + Math.max(0.01, legacy.territories[id].population as number),
      0,
    );
    const expectedAttack = Math.round((ownedTerritories.reduce((sum, id) => {
      const originId = WORLD_CONTENT_V2.territories[id].initialOwnerId;
      const origin = WORLD_CONTENT_V2.nations[originId];
      return sum + (origin.militaryAttackRating ?? origin.militaryQuality)
        * Math.max(0.01, legacy.territories[id].population as number);
    }, 0) / weight) * 1_000_000_000) / 1_000_000_000;
    const expectedDefense = Math.round((ownedTerritories.reduce((sum, id) => {
      const originId = WORLD_CONTENT_V2.territories[id].initialOwnerId;
      const origin = WORLD_CONTENT_V2.nations[originId];
      return sum + (origin.militaryDefenseRating ?? origin.militaryQuality)
        * Math.max(0.01, legacy.territories[id].population as number);
    }, 0) / weight) * 1_000_000_000) / 1_000_000_000;
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    expect(loaded.schemaVersion).toBe(22);
    expect(Object.values(loaded.players).every((nation) => nation.trainedReserves === 0)).toBe(true);
    expect(loaded.rulesVersion).toBe(V2_RULES_VERSION);
    expect(loaded.territories[belTerritory].army.baseAttack).toBe(expectedAttack);
    expect(loaded.territories[belTerritory].army.baseDefense).toBe(expectedDefense);
    expect(loaded.territories[luxTerritory].army.baseAttack).toBe(expectedAttack);
    expect(loaded.territories[luxTerritory].army.baseDefense).toBe(expectedDefense);
    expect(loaded.territories[nldTerritory].army.baseAttack).toBe(
      WORLD_CONTENT_V2.nations[nationIdV2('nld')].militaryAttackRating,
    );
    expect(loaded.territories[nldTerritory].army.baseDefense).toBe(
      WORLD_CONTENT_V2.nations[nationIdV2('nld')].militaryDefenseRating,
    );
  });

  it('authenticates schema 14 before assigning army quality', () => {
    const legacy = legacySaveV14();
    legacy.territories[territoryIdV2('bel')].army.manpower *= 0.5;
    expect(() => loadSaveV2(legacy as never, WORLD_CONTENT_V2)).toThrow(/hash mismatch/);
  });

  it('migrates schema 15 saves with unused manual action counters', () => {
    const legacy = legacySaveV16(93);
    legacy.schemaVersion = 15;
    legacy.rulesVersion = 'frontier-command-v2.50-mixed-armies';
    for (const nation of Object.values(legacy.players) as Array<Record<string, any>>) {
      delete nation.manualActionUses;
    }
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    expect(loaded.schemaVersion).toBe(22);
    expect(Object.values(loaded.players).every((nation) => nation.trainedReserves === 0)).toBe(true);
    expect(loaded.players[nationIdV2('bel')].manualActionUses).toEqual({
      rapidRecruitment: 0,
      researchSurge: 0,
      propaganda: 0,
    });
  });

  it('rejects a rehashed non-canonical schema 14 army', () => {
    const legacy = legacySaveV14();
    legacy.territories[territoryIdV2('bel')].army.legacyQuality = 2;
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);
    expect(() => loadSaveV2(legacy as never, WORLD_CONTENT_V2)).toThrow(/non-canonical veteran army/);
  });

  it('migrates the last single-front save and conserves the combined Danish-Greenland state', () => {
    const legacy = legacySaveV16(94);
    const populationBefore = legacy.territories.dnk.population as number;
    const economyBefore = legacy.territories.dnk.economy as number;
    const manpowerBefore = legacy.territories.dnk.army.manpower as number;
    const bel = nationIdV2('bel');
    const lux = nationIdV2('lux');
    legacy.wars.push({
      id: 'war-legacy-front', attackerId: bel, defenderId: lux,
      startedTick: 0, lastBattleTick: 0, warScore: 0, battles: 0,
      attackerLosses: 0, defenderLosses: 0, lastPeaceOfferTick: -1_000_000,
      attackerOperation: {
        commanderId: bel, sourceId: territoryIdV2('bel'), targetId: territoryIdV2('lux'),
        doctrine: 'pressure', access: 'land', startedTick: 0, lastBattleTick: 0,
        holdUntilTick: 8, momentum: 0,
      },
    });
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    expect(loaded.schemaVersion).toBe(22);
    expect(Object.values(loaded.players).every((nation) => nation.trainedReserves === 0)).toBe(true);
    expect(loaded.territories[territoryIdV2('grl')].owner).toBe(nationIdV2('dnk'));
    expect(loaded.territories[territoryIdV2('dnk')].population
      + loaded.territories[territoryIdV2('grl')].population).toBeCloseTo(populationBefore, 8);
    expect(loaded.territories[territoryIdV2('dnk')].economy
      + loaded.territories[territoryIdV2('grl')].economy).toBeCloseTo(economyBefore, 8);
    expect(loaded.territories[territoryIdV2('dnk')].army.manpower
      + loaded.territories[territoryIdV2('grl')].army.manpower).toBeCloseTo(manpowerBefore, 8);
    expect(loaded.wars[0]?.attackerOperations).toHaveLength(1);
    expect(loaded.wars[0]?.defenderOperations).toEqual([]);
    expect(Object.values(loaded.territories).every((territory) => territory.integration === 1)).toBe(true);
  });

  it('authenticates and expands the final six-program schema-20 save format', () => {
    const legacy = structuredClone(createSaveV2(
      createWorldStateV2(95), WORLD_CONTENT_V2,
    )) as Record<string, any>;
    removeSchema22Fields(legacy);
    legacy.schemaVersion = 20;
    delete legacy.humanPlayerIds;
    legacy.rulesVersion = 'frontier-command-v2.55-combat-rebalance';
    for (const nation of Object.values(legacy.players) as Array<Record<string, any>>) {
      nation.research.effectLevels.control = 4;
      nation.research.effectLevels['reinforcement-efficiency'] = 2;
      for (const branch of [
        'food-systems', 'reserve-doctrine', 'public-administration', 'education-intelligence',
      ]) {
        delete nation.research.allocations[branch];
        delete nation.research.progress[branch];
        delete nation.research.breakthroughs[branch];
      }
      for (const effect of [
        'food-production', 'food-storage', 'reserve-training', 'reserve-mobilization',
        'tax-efficiency', 'operating-efficiency', 'iq-increase',
      ]) delete nation.research.effectLevels[effect];
    }
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    const research = loaded.players[nationIdV2('bel')].research;
    expect(loaded.rulesVersion).toBe(V2_RULES_VERSION);
    expect(research.allocations['military-industry']).toBe(40);
    expect(research.allocations['economy-science']).toBe(60);
    expect(research.allocations['education-intelligence']).toBe(0);
    expect(research.progress['food-systems']).toBe(0);
    expect(research.effectLevels['iq-increase']).toBe(0);
    expect(research.effectLevels['reinforcement-efficiency']).toBe(6);
    expect('control' in research.effectLevels).toBe(false);
    expect(research.breakthroughs['public-administration']).toBe(0);
  });

  it('retires authenticated v2.56 partial control and territorial peace offers', () => {
    const legacy = structuredClone(createSaveV2(
      createWorldStateV2(96), WORLD_CONTENT_V2,
    )) as Record<string, any>;
    removeSchema22Fields(legacy);
    legacy.schemaVersion = 20;
    delete legacy.humanPlayerIds;
    legacy.rulesVersion = 'frontier-command-v2.56-research-expansion';
    legacy.territories.nld.control = { controller: 'bel', share: 0.62 };
    legacy.players.bel.research.effectLevels.control = 3;
    legacy.players.bel.research.effectLevels['reinforcement-efficiency'] = 5;
    legacy.offers.push({
      id: 'offer-retired-control',
      fromId: 'nld',
      toId: 'bel',
      warId: 'war-retired-control',
      settlement: 'control',
      createdTick: 0,
      expiresTick: 26,
      status: 'pending',
      territoryId: 'nld',
    });
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);

    expect(loaded.rulesVersion).toBe(V2_RULES_VERSION);
    expect('control' in loaded.territories[territoryIdV2('nld')]).toBe(false);
    expect('control' in loaded.players[nationIdV2('bel')].research.effectLevels).toBe(false);
    expect(loaded.players[nationIdV2('bel')].research.effectLevels['reinforcement-efficiency']).toBe(8);
    expect(loaded.offers).toEqual([]);
    expect(() => createSaveV2(loaded, WORLD_CONTENT_V2)).not.toThrow();
  });

  it('authenticates and discards retired campaign-strain fields without applying them', () => {
    const legacy = structuredClone(createSaveV2(
      createWorldStateV2(97), WORLD_CONTENT_V2,
    )) as Record<string, any>;
    legacy.warStrain = { score: 100, level: 'critical' };
    legacy.warStrainScore = 100;
    legacy.players.bel.warStrain = 100;
    legacy.players.bel.warStrainLevel = 'critical';
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    const loadedRecord = loaded as unknown as Record<string, unknown>;
    const belgium = loaded.players[nationIdV2('bel')] as unknown as Record<string, unknown>;
    const resaved = createSaveV2(loaded, WORLD_CONTENT_V2) as unknown as Record<string, unknown>;

    expect('warStrain' in loadedRecord).toBe(false);
    expect('warStrainScore' in loadedRecord).toBe(false);
    expect('warStrain' in belgium).toBe(false);
    expect('warStrainLevel' in belgium).toBe(false);
    expect('warStrain' in resaved).toBe(false);
  });

  it('normalizes an authenticated mid-war save without the report ledgers', () => {
    const state = createWorldStateV2(97_001, WORLD_CONTENT_V2);
    const humanId = nationIdV2('bel');
    const opponentId = nationIdV2('nld');
    state.wars = [{
      id: 'war-pre-apex-ledger',
      attackerId: humanId,
      defenderId: opponentId,
      startedTick: 0,
      lastBattleTick: 0,
      warScore: 0,
      battles: 1,
      attackerLosses: 0.001,
      defenderLosses: 0.002,
      attackerCivilianLosses: 0,
      defenderCivilianLosses: 0,
      lastPeaceOfferTick: -1_000_000,
      attackerOperations: [],
      defenderOperations: [],
      revenge: null,
    }];
    const legacy = structuredClone(createSaveV2(
      state, WORLD_CONTENT_V2,
    )) as Record<string, any>;
    delete legacy.wars[0].apexTelemetryByPlayer;
    delete legacy.wars[0].reportBaselineByPlayer;
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);

    expect(loaded.wars[0]!.apexTelemetryByPlayer).toEqual({});
    expect(loaded.wars[0]!.reportBaselineByPlayer).toEqual({});
    expect(createSaveV2(loaded, WORLD_CONTENT_V2).wars[0]!.apexTelemetryByPlayer)
      .toEqual({});
    expect(createSaveV2(loaded, WORLD_CONTENT_V2).wars[0]!.reportBaselineByPlayer)
      .toEqual({});
  });

  it('authenticates and retires old settlement offers, obligations and counters', () => {
    const legacy = structuredClone(createSaveV2(
      createWorldStateV2(98), WORLD_CONTENT_V2,
    )) as Record<string, any>;
    legacy.players.bel.ceasefiresRequested = 3;
    legacy.offers = [{
      id: 'offer-retired-settlement',
      fromId: 'bel',
      toId: 'nld',
      warId: 'war-retired-settlement',
      settlement: 'ceasefire',
      createdTick: 0,
      expiresTick: 26,
      status: 'pending',
      weeklyCost: 1,
      paymentWeeks: 52,
    }];
    legacy.ceasefireObligations = [{
      warId: 'war-retired-settlement',
      payerId: 'bel',
      payeeId: 'nld',
      weeklyCost: 1,
      startsTick: 0,
      expiresTick: 52,
    }];
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    expect(loaded.offers).toEqual([]);
    expect(loaded.ceasefireObligations).toEqual([]);
    expect(loaded.players[nationIdV2('bel')].ceasefiresRequested).toBe(0);

    const resaved = createSaveV2(loaded, WORLD_CONTENT_V2);
    expect(resaved.offers).toEqual([]);
    expect(resaved.ceasefireObligations).toEqual([]);
    expect(resaved.players[nationIdV2('bel')].ceasefiresRequested).toBe(0);
  });

  it('redistributes authenticated v2.76/v2.77 Survival saves toward the Antarctic perimeter with exact totals', () => {
    const content = resolveScenarioV2({ mode: 'survival', seed: 97_601 }).content;
    const weightedShares = antarcticWeightShareByTerritory(content);
    const perimeterIds = ANTARCTIC_TERRITORY_IDS_V2.filter((territoryId) => (
      content.territories[territoryId]?.kind === 'rogue-perimeter'
    ));
    const coreId = territoryIdV2('zero-point-core');

    for (const rulesVersion of [LEGACY_RULES_VERSION_V22_76, LEGACY_RULES_VERSION_V22_77]) {
      const state = createWorldStateV2(97_601, content);
      const legacy = createLegacyAntarcticRedistributionSave(state, content, rulesVersion);
      const totalBefore = totalAntarcticManpower(legacy);
      const baseBefore = totalAntarcticBaseManpower(legacy);
      const legacyPerimeter = round(perimeterIds.reduce((sum, territoryId) => (
        sum + legacy.territories[territoryId].army.manpower
      ), 0), 9);
      const legacyCore = legacy.territories[coreId].army.manpower;

      const loaded = loadSaveV2(legacy as never, content);
      const totalAfter = round(ANTARCTIC_TERRITORY_IDS_V2.reduce((sum, territoryId) => (
        sum + loaded.territories[territoryId]!.army.manpower
      ), 0), 9);
      const migratedPerimeter = round(perimeterIds.reduce((sum, territoryId) => (
        sum + loaded.territories[territoryId]!.army.manpower
      ), 0), 9);

      expect(loaded.rulesVersion).toBe(V2_RULES_VERSION);
      expect(totalAfter).toBe(totalBefore);
      expect(migratedPerimeter).toBeGreaterThan(legacyPerimeter);
      expect(loaded.territories[coreId]!.army.manpower).toBeLessThan(legacyCore);
      for (const territoryId of ANTARCTIC_TERRITORY_IDS_V2) {
        expect(loaded.territories[territoryId]!.army.manpower).toBeCloseTo(
          round(baseBefore * weightedShares[territoryId]!, 9),
          9,
        );
      }
    }
  });

  it('repairs an authenticated v2.77 Survival opening while its Rogue war is already active', () => {
    const seed = 97_606;
    const content = resolveScenarioV2({ mode: 'survival', seed }).content;
    const engine = new WorldEngineV2(seed, content);
    expect(engine.chooseCountry('bel')).toEqual({ accepted: true });
    expect(engine.formSurvivalEmpire('bel', [])).toEqual({ accepted: true });
    expect(engine.state.wars.some((war) => war.attackerId === ROGUE_AI_NATION_ID_V2)).toBe(true);

    const legacy = createLegacyAntarcticRedistributionSave(
      engine.state,
      content,
      LEGACY_RULES_VERSION_V22_77,
    );
    const totalBefore = totalAntarcticManpower(legacy);
    const drakeBefore = legacy.territories['drake-entry'].army.manpower;
    const activeWarIds = legacy.wars.map((war: { id: string }) => war.id);

    const loaded = loadSaveV2(legacy as never, content);

    expect(loaded.wars.map((war) => war.id)).toEqual(activeWarIds);
    expect(loaded.wars.some((war) => war.attackerId === ROGUE_AI_NATION_ID_V2)).toBe(true);
    expect(loaded.territories[territoryIdV2('drake-entry')]!.army.manpower)
      .toBeGreaterThan(drakeBefore);
    expect(round(ANTARCTIC_TERRITORY_IDS_V2.reduce((sum, territoryId) => (
      sum + loaded.territories[territoryId]!.army.manpower
    ), 0), 9)).toBe(totalBefore);
  });

  it('preserves wave ledgers and territory-local wave manpower while redistributing only the Antarctic base cohort', () => {
    const content = resolveScenarioV2({ mode: 'survival', seed: 97_602 }).content;
    const weightedShares = antarcticWeightShareByTerritory(content);
    const legacy = createLegacyAntarcticRedistributionSave(
      createWorldStateV2(97_602, content),
      content,
      LEGACY_RULES_VERSION_V22_77,
    );
    legacy.polarEndgame.rogueWaveManpowerByTerritory = {
      'drake-entry': 0.031,
      'queen-maud-grid': 0.047,
      'zero-point-core': 0.113,
    };
    for (const [territoryId, waveManpower] of Object.entries(
      legacy.polarEndgame.rogueWaveManpowerByTerritory,
    )) {
      legacy.territories[territoryId].army.manpower = round(
        legacy.territories[territoryId].army.manpower + Number(waveManpower),
        9,
      );
    }
    const totalBefore = totalAntarcticManpower(legacy);
    const baseBefore = totalAntarcticBaseManpower(legacy);
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, content);

    expect(loaded.polarEndgame.rogueWaveManpowerByTerritory).toEqual(
      legacy.polarEndgame.rogueWaveManpowerByTerritory,
    );
    expect(round(ANTARCTIC_TERRITORY_IDS_V2.reduce((sum, territoryId) => (
      sum + loaded.territories[territoryId]!.army.manpower
    ), 0), 9)).toBe(totalBefore);
    for (const territoryId of ANTARCTIC_TERRITORY_IDS_V2) {
      const wave = legacy.polarEndgame.rogueWaveManpowerByTerritory[territoryId] ?? 0;
      expect(loaded.territories[territoryId]!.army.manpower - wave).toBeCloseTo(
        round(baseBefore * weightedShares[territoryId]!, 9),
        9,
      );
    }
  });

  it('skips Antarctic redistribution once any sector is no longer Rogue-owned', () => {
    const content = resolveScenarioV2({ mode: 'survival', seed: 97_603 }).content;
    const breachedId = territoryIdV2('drake-entry');
    const invaderId = nationIdV2('grl');
    const legacy = createLegacyAntarcticRedistributionSave(
      createWorldStateV2(97_603, content),
      content,
      LEGACY_RULES_VERSION_V22_77,
    );
    const before = Object.fromEntries(ANTARCTIC_TERRITORY_IDS_V2.map((territoryId) => [
      territoryId,
      legacy.territories[territoryId].army.manpower,
    ]));
    legacy.territories[breachedId].owner = invaderId;
    legacy.territories[breachedId].coreOwner = invaderId;
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const loaded = loadSaveV2(legacy as never, content);
    const resaved = createSaveV2(loaded, content);

    expect(loaded.rulesVersion).toBe(V2_RULES_VERSION);
    for (const territoryId of ANTARCTIC_TERRITORY_IDS_V2) {
      expect(loaded.territories[territoryId]!.army.manpower).toBe(before[territoryId]);
    }
    expect(createSaveV2(loadSaveV2(resaved, content), content)).toEqual(resaved);
  });

  it('round-trips current v2.80 Antarctic saves idempotently without legacy redistribution', () => {
    const content = resolveScenarioV2({ mode: 'survival', seed: 97_604 }).content;
    const current = structuredClone(createSaveV2(
      createWorldStateV2(97_604, content),
      content,
    )) as Record<string, any>;
    current.polarEndgame.rogueWaveManpowerByTerritory = {
      'maud-entry': 0.022,
      'transantarctic-vault': 0.064,
    };
    current.territories['drake-entry'].army.manpower = 0.04;
    current.territories['maud-entry'].army.manpower = 0.08;
    current.territories['ross-entry'].army.manpower = 0.12;
    current.territories['weddell-forge'].army.manpower = 0.18;
    current.territories['queen-maud-grid'].army.manpower = 0.23;
    current.territories['ross-array'].army.manpower = 0.27;
    current.territories['sentinel-labyrinth'].army.manpower = 0.11;
    current.territories['transantarctic-vault'].army.manpower = 0.29;
    current.territories['zero-point-core'].army.manpower = 0.09;
    current.canonicalStateHash = canonicalStateHashV2(current);

    const loaded = loadSaveV2(current as never, content);
    const resaved = createSaveV2(loaded, content);

    expect(resaved).toEqual(current);
  });

  it('authenticates v2.79 and preserves active research plus every tick deadline without x7 scaling', () => {
    const state = createWorldStateV2(97_610, WORLD_CONTENT_V2);
    const playerId = nationIdV2('bel');
    const rivalId = nationIdV2('nld');
    state.tick = 91;
    state.players[playerId]!.research.activeProgram = 'logistics-medicine';
    state.players[playerId]!.rapidRecruitmentAvailableTick = 121;
    state.players[playerId]!.researchSurgeAvailableTick = 173;
    state.players[playerId]!.propagandaAvailableTick = 195;
    state.players[playerId]!.propagandaProgram = {
      startedTick: 80,
      endsTick: 132,
      totalSuspicionReduction: 12,
      weeklySuspicionReduction: round(12 / 52, 12),
    };
    state.truces = [{
      leftId: playerId,
      rightId: rivalId,
      expiresTick: 211,
    }];
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);

    const legacy = structuredClone(createSaveV2(
      state,
      WORLD_CONTENT_V2,
    )) as Record<string, any>;
    legacy.rulesVersion = LEGACY_RULES_VERSION_V22_79;
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);

    const tampered = structuredClone(legacy);
    tampered.tick *= 7;
    expect(() => loadSaveV2(tampered as never, WORLD_CONTENT_V2))
      .toThrow(/hash mismatch/i);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    const resaved = createSaveV2(loaded, WORLD_CONTENT_V2);

    expect(loaded.rulesVersion).toBe(V2_RULES_VERSION);
    expect(loaded.tick).toBe(91);
    expect(loaded.players[playerId]!.research.activeProgram).toBe('logistics-medicine');
    expect(loaded.players[playerId]).toMatchObject({
      rapidRecruitmentAvailableTick: 121,
      researchSurgeAvailableTick: 173,
      propagandaAvailableTick: 195,
      propagandaProgram: {
        startedTick: 80,
        endsTick: 132,
      },
    });
    expect(loaded.truces).toEqual([{
      leftId: playerId,
      rightId: rivalId,
      expiresTick: 211,
    }]);
    expect(resaved.rulesVersion).toBe(V2_RULES_VERSION);
    expect(resaved.tick).toBe(legacy.tick);
    expect(resaved.players[playerId]!.research.activeProgram)
      .toBe(legacy.players[playerId].research.activeProgram);
    expect(resaved.players[playerId]!.rapidRecruitmentAvailableTick)
      .toBe(legacy.players[playerId].rapidRecruitmentAvailableTick);
    expect(resaved.players[playerId]!.researchSurgeAvailableTick)
      .toBe(legacy.players[playerId].researchSurgeAvailableTick);
    expect(resaved.players[playerId]!.propagandaAvailableTick)
      .toBe(legacy.players[playerId].propagandaAvailableTick);
    expect(resaved.players[playerId]!.propagandaProgram)
      .toEqual(legacy.players[playerId].propagandaProgram);
    expect(resaved.truces).toEqual(legacy.truces);
  });

  it('redistributes authenticated pre-contact Campaign v2.77 saves before first Antarctic contact', () => {
    const state = createWorldStateV2(97_605, WORLD_CONTENT_V2);
    const weightedShares = antarcticWeightShareByTerritory(WORLD_CONTENT_V2);
    const legacy = createLegacyAntarcticRedistributionSave(
      state,
      WORLD_CONTENT_V2,
      LEGACY_RULES_VERSION_V22_77,
    );
    const baseBefore = totalAntarcticBaseManpower(legacy);

    expect(state.polarEndgame.phase).toBe('dormant');

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);

    expect(loaded.polarEndgame.phase).toBe('dormant');
    for (const territoryId of ANTARCTIC_TERRITORY_IDS_V2) {
      expect(loaded.territories[territoryId]!.army.manpower).toBeCloseTo(
        round(baseBefore * weightedShares[territoryId]!, 9),
        9,
      );
    }
  });

  it('authenticates v2.78 before deterministically migrating the highest allocation to active research', () => {
    const state = createWorldStateV2(97_606, WORLD_CONTENT_V2);
    const playerId = nationIdV2('bel');
    state.rngState = 123_456_789;
    state.actionSequence = 7;
    state.players[playerId]!.treasury = 321.75;
    state.players[playerId]!.research.allocations = {
      'population-recruitment': 20,
      'military-industry': 40,
      'advanced-weapons': 40,
      'defensive-systems': 0,
      'logistics-medicine': 0,
      'economy-science': 0,
      'food-systems': 0,
      'reserve-doctrine': 0,
      'public-administration': 0,
      'education-intelligence': 0,
    };
    const legacy = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    legacy.rulesVersion = LEGACY_RULES_VERSION_V22_78;
    for (const nation of Object.values(legacy.players) as Array<Record<string, any>>) {
      delete nation.research.activeProgram;
    }
    legacy.canonicalStateHash = canonicalStateHashV2(legacy);
    const tampered = structuredClone(legacy);
    tampered.players[playerId].research.allocations['military-industry'] = 39;
    expect(() => loadSaveV2(tampered as never, WORLD_CONTENT_V2)).toThrow(/hash mismatch/i);

    const loaded = loadSaveV2(legacy as never, WORLD_CONTENT_V2);
    const resaved = createSaveV2(loaded, WORLD_CONTENT_V2);
    const reloaded = loadSaveV2(resaved, WORLD_CONTENT_V2);

    expect(loaded.rulesVersion).toBe(V2_RULES_VERSION);
    expect(loaded.players[playerId]!.research.activeProgram).toBe('military-industry');
    expect(loaded.tick).toBe(0);
    expect(loaded.rngState).toBe(123_456_789);
    expect(loaded.actionSequence).toBe(7);
    expect(loaded.players[playerId]!.treasury).toBe(321.75);
    expect(createSaveV2(reloaded, WORLD_CONTENT_V2)).toEqual(resaved);
  });

  it('rejects missing or malformed active research in rehashed current saves', () => {
    const missing = structuredClone(createSaveV2(
      createWorldStateV2(97_607), WORLD_CONTENT_V2,
    )) as Record<string, any>;
    delete missing.players.bel.research.activeProgram;
    missing.canonicalStateHash = canonicalStateHashV2(missing);
    expect(() => loadSaveV2(missing as never, WORLD_CONTENT_V2))
      .toThrow(/research|active research/i);

    const malformed = structuredClone(createSaveV2(
      createWorldStateV2(97_608), WORLD_CONTENT_V2,
    )) as Record<string, any>;
    malformed.players.bel.research.activeProgram = 'forged-program';
    malformed.canonicalStateHash = canonicalStateHashV2(malformed);
    expect(() => loadSaveV2(malformed as never, WORLD_CONTENT_V2))
      .toThrow(/active research/i);

    const preseededLegacy = structuredClone(createSaveV2(
      createWorldStateV2(976_081), WORLD_CONTENT_V2,
    )) as Record<string, any>;
    preseededLegacy.rulesVersion = LEGACY_RULES_VERSION_V22_78;
    preseededLegacy.canonicalStateHash = canonicalStateHashV2(preseededLegacy);
    expect(() => loadSaveV2(preseededLegacy as never, WORLD_CONTENT_V2))
      .toThrow(/non-canonical research state/i);
  });

  it('keeps a created save immutable when live research changes afterwards', () => {
    const state = createWorldStateV2(97_609, WORLD_CONTENT_V2);
    const playerId = nationIdV2('bel');
    state.players[playerId]!.research.activeProgram = 'military-industry';
    const save = createSaveV2(state, WORLD_CONTENT_V2);
    const savedResearch = structuredClone(save.players[playerId]!.research);

    state.players[playerId]!.research.activeProgram = 'economy-science';
    state.players[playerId]!.research.allocations['military-industry'] = 0;
    state.players[playerId]!.research.allocations['economy-science'] = 100;
    state.players[playerId]!.research.progress['military-industry'] += 7;
    state.players[playerId]!.research.effectLevels.attack += 2;
    state.players[playerId]!.research.breakthroughs['advanced-weapons'] += 1;

    expect(save.players[playerId]!.research).toEqual(savedResearch);
    expect(canonicalStateHashV2(save)).toBe(save.canonicalStateHash);
  });
});
