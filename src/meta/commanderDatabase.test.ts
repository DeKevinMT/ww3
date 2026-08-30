import { describe, expect, it } from 'vitest';
import {
  commanderXpForLevelV1,
  createCommanderProfileV1,
  emptyCommanderTalentsV1,
  resolveCountryLoadoutV1,
} from './commanderProfile';
import { CommanderDatabaseV1 } from './commanderDatabase';
import {
  CAMPAIGN_SLOT_STORAGE_KEY,
  COMMANDER_PROFILE_STORAGE_KEY,
  type KeyValueStorage,
  type StoredCampaignV1,
} from './commanderStorage';

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function storedCampaign(): StoredCampaignV1 {
  const talents = emptyCommanderTalentsV1();
  talents['elite-vanguard'] = 15;
  const profile = {
    ...createCommanderProfileV1(1, 'database-campaign'),
    unlockedCountryIds: ['bel'],
    countryUpgrades: {
      bel: { mobilization: 0, logistics: 0, research: 0, economy: 0, trait: 0 },
    },
    countryMastery: {
      bel: {
        xp: 0,
        level: 1,
        campaigns: 0,
        victories: 0,
        bestSurvivalWave: 0,
        allocations: { force: 0, firepower: 0, defense: 0, mobilization: 0 },
      },
    },
    commanderXp: commanderXpForLevelV1(15),
    commanderLevel: 15,
    commanderTalents: talents,
    activeDoctrine: 'vanguard' as const,
  };
  return {
    schemaVersion: 1,
    campaignId: 'database-campaign-1',
    scenario: { mode: 'standard-2026', version: 1, seed: 77 },
    countryId: 'bel',
    defeatedCountryIds: [],
    signalPurgedCountryIds: [],
    warOutcomes: [],
    profileRevisionAtStart: profile.revision,
    loadout: resolveCountryLoadoutV1(profile, 'bel'),
    rewardEligible: true,
    stateSave: '{"canonical":true}',
    baseline: {
      startingTerritoryIds: ['bel'],
      startingMilitaryLosses: 0,
      startingTick: 0,
    },
    startedAt: 10,
    updatedAt: 20,
  };
}

describe('Commander database persistence', () => {
  it('commits a verified local profile backup before the async primary store can yield', async () => {
    const storage = new MemoryStorage();
    const database = new CommanderDatabaseV1(storage, undefined);
    const talents = emptyCommanderTalentsV1();
    talents['doctrine-command'] = 5;
    const profile = {
      ...createCommanderProfileV1(100, 'database-profile'),
      displayName: 'Ada',
      empireName: 'Northern Star Union',
      commanderXp: commanderXpForLevelV1(5),
      commanderLevel: 5,
      commanderTalents: talents,
      activeDoctrine: 'bastion' as const,
    };

    const pending = database.saveProfile(profile, 101);
    expect(JSON.parse(storage.getItem(COMMANDER_PROFILE_STORAGE_KEY) ?? '{}')).toMatchObject({
      displayName: 'Ada',
      empireName: 'Northern Star Union',
      activeDoctrine: 'bastion',
    });
    await pending;

    const reloaded = await new CommanderDatabaseV1(storage, undefined).loadProfile(102);
    expect(reloaded.displayName).toBe('Ada');
    expect(reloaded.empireName).toBe('Northern Star Union');
    expect(reloaded.activeDoctrine).toBe('bastion');
  });

  it('round-trips and clears the single resumable campaign without IndexedDB', async () => {
    const storage = new MemoryStorage();
    const database = new CommanderDatabaseV1(storage, undefined);
    const campaign = storedCampaign();

    const pending = database.saveCampaign(campaign);
    expect(storage.getItem(CAMPAIGN_SLOT_STORAGE_KEY)).toBe(JSON.stringify(campaign));
    await pending;
    const reloaded = await new CommanderDatabaseV1(storage, undefined).loadCampaign();
    expect(reloaded).toEqual(campaign);
    expect(reloaded?.loadout.commanderTalents['elite-vanguard']).toBe(15);
    expect(reloaded?.loadout.activeDoctrine).toBe('vanguard');
    expect(reloaded?.loadout.masteryMilitary).toEqual({
      openingArmyMultiplier: 1,
      armyCapacityMultiplier: 1,
      attackMultiplier: 1,
      defenseMultiplier: 1,
      recruitmentMultiplier: 1,
      reserveTrainingMultiplier: 1,
      landSupplyMultiplier: 1,
      landTransferThroughputMultiplier: 1,
      navalSupplyMultiplier: 1,
      navalTransferThroughputMultiplier: 1,
      navalTransferCostMultiplier: 1,
      recruitmentCostMultiplier: 1,
      standingOperatingCostMultiplier: 1,
      casualtyMultiplier: 1,
    });

    await database.clearCampaign();
    expect(storage.getItem(CAMPAIGN_SLOT_STORAGE_KEY)).toBeNull();
    expect(await database.loadCampaign()).toBeUndefined();
  });
});
