import { describe, expect, it } from 'vitest';
import { V2_RULES_VERSION, WAR_REVENGE_WINDOW_TICKS } from './balance';
import { createWorldStateV2 } from './bootstrap';
import { stateTerritoryArmyCapacityTargetV2, synchronizeArmyCapacityV2 } from './capacity';
import { WORLD_CONTENT_V2 } from './content';
import {
  beginTerritoryIntegrationV2,
  INTEGRATION_DURATION_MULTIPLIER_V2,
  territoryIntegrationAnnualCostV2,
  territoryIntegrationDurationWeeksV2,
} from './integration';
import { canonicalStateHashV2, createSaveV2, loadSaveV2 } from './persistence';
import {
  invalidateTerritoryIndexV2,
  selectFoodDomesticCapacityTargetV2,
} from './selectors';
import { nationIdV2, territoryIdV2 } from './types';

const LEGACY_CONTENT_VERSION_V16 = 'natural-earth-countries-2026-v6-naval';

function removeSchema22Fields(save: Record<string, any>): void {
  delete save.alliances;
  delete save.allianceOffers;
  for (const war of save.wars as Array<Record<string, any>>) delete war.revenge;
}

function legacySaveV16(seed: number): Record<string, any> {
  const current = structuredClone(createSaveV2(createWorldStateV2(seed), WORLD_CONTENT_V2)) as Record<string, any>;
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
  const current = structuredClone(createSaveV2(createWorldStateV2(seed), WORLD_CONTENT_V2)) as Record<string, any>;
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
    territory.army.veteranManpower = 0;
    territory.army.veteranExperience = 0;
  }
  current.canonicalStateHash = canonicalStateHashV2(current);
  return current;
}

function legacySaveV19(seed: number): Record<string, any> {
  const current = structuredClone(createSaveV2(createWorldStateV2(seed), WORLD_CONTENT_V2)) as Record<string, any>;
  removeSchema22Fields(current);
  delete current.humanPlayerIds;
  current.schemaVersion = 19;
  current.rulesVersion = 'frontier-command-v2.54-faster-integration';
  for (const nation of Object.values(current.players) as Array<Record<string, any>>) {
    delete nation.trainedReserves;
    nation.combatExperience = 7.25;
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

describe('V2 legacy save migration', () => {
  it('authenticates schema-22 V2.59 saves before upgrading their rules version', () => {
    const state = createWorldStateV2(8_590);
    state.tick = 37;
    const legacy = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    legacy.rulesVersion = 'frontier-command-v2.59-country-traits';
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
    state.humanPlayerId = greenland;
    state.humanPlayerIds = [greenland];
    synchronizeArmyCapacityV2(state, WORLD_CONTENT_V2);
    const legacy = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    legacy.rulesVersion = 'frontier-command-v2.59-country-traits';
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

  it('requires trained reserves in current saves and round-trips them through the canonical hash', () => {
    const state = createWorldStateV2(8_602);
    const belgium = nationIdV2('bel');
    state.players[belgium].trainedReserves = 1.234567;
    const save = createSaveV2(state, WORLD_CONTENT_V2);
    const loaded = loadSaveV2(save, WORLD_CONTENT_V2);
    expect(loaded.players[belgium].trainedReserves).toBe(1.234567);
    expect(createSaveV2(loaded, WORLD_CONTENT_V2).canonicalStateHash)
      .toBe(save.canonicalStateHash);

    const missing = structuredClone(save) as Record<string, any>;
    delete missing.players[belgium].trainedReserves;
    missing.canonicalStateHash = canonicalStateHashV2(missing);
    expect(() => loadSaveV2(missing as never, WORLD_CONTENT_V2))
      .toThrow(/non-canonical keys|invalid scalar/i);

    const leakedLegacy = legacySaveV19(8_603);
    leakedLegacy.players[belgium].trainedReserves = 1;
    leakedLegacy.canonicalStateHash = canonicalStateHashV2(leakedLegacy);
    expect(() => loadSaveV2(leakedLegacy as never, WORLD_CONTENT_V2))
      .toThrow(/non-canonical Combat Experience state/i);
  });

  it('initializes missing same-schema domestic food capacity only after authentication', () => {
    const state = createWorldStateV2(87);
    const belgium = nationIdV2('bel');
    const oldCurrent = structuredClone(createSaveV2(state, WORLD_CONTENT_V2)) as Record<string, any>;
    delete oldCurrent.players[belgium].domesticFoodCapacity;
    oldCurrent.canonicalStateHash = canonicalStateHashV2(oldCurrent);

    const loaded = loadSaveV2(oldCurrent as never, WORLD_CONTENT_V2);
    expect(loaded.players[belgium].domesticFoodCapacity).toBeCloseTo(
      selectFoodDomesticCapacityTargetV2(loaded, WORLD_CONTENT_V2, belgium),
      8,
    );
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
      legacy.territories[luxTerritory].army.capacity,
      Math.max(0.000001, legacy.territories[luxTerritory].army.manpower),
    );
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
});
