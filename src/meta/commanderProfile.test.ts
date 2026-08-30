import { describe, expect, it } from 'vitest';
import {
  BASE_COUNTRY_TRAIT_SCALE_V1,
  BASE_COMMANDER_FORCE_V1,
  COMMANDER_DOCTRINES_V1,
  COMMANDER_TALENT_CORE_RANK,
  COMMANDER_TALENTS_V1,
  COUNTRY_MASTERY_DEFENSE_PER_POINT_V1,
  COUNTRY_MASTERY_FIREPOWER_PER_POINT_V1,
  COUNTRY_MASTERY_FORCE_CAPACITY_PER_POINT_V1,
  COUNTRY_MASTERY_RECRUITMENT_PER_POINT_V1,
  COUNTRY_MASTERY_RESERVE_TRAINING_PER_POINT_V1,
  MAX_COUNTRY_MASTERY_LEVEL,
  STARTER_COUNTRY_ID,
  STARTER_COUNTRY_POOL_SIZE,
  STARTING_COMMAND_CREDITS_V1,
  allocateCountryMasteryPointV1,
  allocateCommanderTalentV1,
  buildCountryUnlockCatalogV1,
  calculateCampaignRewardV1,
  claimCampaignRewardV1,
  commanderTalentPointsAvailableV1,
  commanderTalentAllocationQuoteV1,
  commanderTalentCurveV1,
  commanderTalentEffectiveRankV1,
  commanderTalentNextRankEfficiencyV1,
  commanderTalentPointsSpentV1,
  commanderTalentRankLevelRequirementV1,
  commanderLevelMaxIntegrityBonusV1,
  commanderMaxIntegrityV1,
  commanderPulseAttackV1,
  commanderLevelFromXpV1,
  commanderXpForLevelV1,
  countryMasteryOpeningBonusV1,
  countryMasteryLevelFromXpV1,
  countryMasteryPointsAvailableV1,
  countryMasteryPointsEarnedV1,
  countryMasteryPointsSpentV1,
  countryMasteryXpDifficultyMultiplierV1,
  countryMasteryXpForLevelV1,
  countryUnlockQuoteV1,
  createCommanderProfileV1,
  emptyCommanderTalentsV1,
  grantStarterCountriesV1,
  isCountryAvailableToUnlockV1,
  normalizeCommanderProfileV1,
  recordCampaignDefeatedCountriesV1,
  recordCampaignSignalPurgedCountriesV1,
  renameEmpireV1,
  selectEmpireFlagV1,
  respecCommanderTalentsV1,
  respecCountryMasteryV1,
  resolveCommanderForceInitializationV1,
  resolveCommanderTalentEffectsV1,
  resolveCountryMasteryMilitaryEffectsV1,
  resolveCountryLoadoutV1,
  selectCommanderDoctrineV1,
  unlockCountryV1,
} from './commanderProfile';
import {
  CAMPAIGN_SLOT_STORAGE_KEY,
  COMMANDER_PROFILE_STORAGE_KEY,
  clearCampaignSlotV1,
  loadCampaignSlotV1,
  loadCommanderProfileV1,
  resetCommanderProfileV1,
  saveCommanderProfileV1,
  saveCampaignSlotV1,
  type KeyValueStorage,
} from './commanderStorage';

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

describe('global commander progression', () => {
  it('makes powerful countries require substantially more play for the same mastery progress', () => {
    const countryCount = 180;
    const strongest = countryMasteryXpDifficultyMultiplierV1(1, countryCount);
    const middle = countryMasteryXpDifficultyMultiplierV1(90, countryCount);
    const weakest = countryMasteryXpDifficultyMultiplierV1(countryCount, countryCount);

    expect(strongest).toBe(12);
    expect(middle).toBeGreaterThan(3);
    expect(middle).toBeLessThan(strongest);
    expect(weakest).toBe(1);
  });

  it('keeps legacy country-trait ranks loadable but permanently inactive', () => {
    const base = createCommanderProfileV1(1, 'trait-baseline');
    expect(resolveCountryLoadoutV1(base, 'grl').traitScale)
      .toBe(BASE_COUNTRY_TRAIT_SCALE_V1);
    const rankOne = normalizeCommanderProfileV1({
      ...base,
      unlockedCountryIds: ['grl'],
      countryUpgrades: {
        grl: { mobilization: 0, logistics: 0, research: 0, economy: 0, trait: 1 },
      },
    }, 2);
    expect(resolveCountryLoadoutV1(rankOne, 'grl').traitScale).toBe(0);
    const rankFive = normalizeCommanderProfileV1({
      ...rankOne,
      countryUpgrades: {
        grl: { mobilization: 0, logistics: 0, research: 0, economy: 0, trait: 5 },
      },
    }, 3);
    expect(resolveCountryLoadoutV1(rankFive, 'grl').traitScale).toBe(0);
  });

  it('migrates retired credits to the new opening balance and preserves every earned nation', () => {
    const base = createCommanderProfileV1(1, 'retired-rival-scaling');
    const normalized = normalizeCommanderProfileV1({
      ...base,
      commandCredits: 321,
      lifetimeCreditsEarned: 9_999,
      unlockedCountryIds: ['grl', 'bel'],
      defeatedCountryIds: ['usa'],
      pendingCountryUnlockNotificationIds: ['usa'],
      campaignAdaptation: { bel: 42, usa: 255 },
    }, 2);
    expect(normalized.campaignAdaptation).toEqual({});
    expect(normalized.commandCredits).toBe(STARTING_COMMAND_CREDITS_V1);
    expect(normalized.lifetimeCreditsEarned).toBe(0);
    expect(normalized.unlockedCountryIds).toEqual(['bel', 'grl', 'usa']);
    expect(normalized.pendingCountryUnlockNotificationIds).toEqual([]);
  });

  it('uses APEX for new and legacy-default identities while preserving custom names', () => {
    const created = createCommanderProfileV1(1, 'apex-identity');
    expect(created.displayName).toBe('APEX');
    expect(normalizeCommanderProfileV1({ ...created, displayName: 'Commander' }, 2).displayName)
      .toBe('APEX');
    expect(normalizeCommanderProfileV1({ ...created, displayName: 'APEX' }, 3).displayName)
      .toBe('APEX');
    expect(normalizeCommanderProfileV1({ ...created, displayName: 'Mara' }, 4).displayName)
      .toBe('Mara');
  });

  it('makes Greenland the only account starter', () => {
    const count = 196;
    const starter = countryUnlockQuoteV1(STARTER_COUNTRY_ID, 166, count);
    expect(starter.starterEligible).toBe(true);
    const otherNation = countryUnlockQuoteV1('other-nation', count, count);
    expect(otherNation.starterEligible).toBe(false);
    const granted = grantStarterCountriesV1(
      createCommanderProfileV1(1, 'starter-test'),
      ['weakest-paid', STARTER_COUNTRY_ID, 'zz-extra-paid-country'],
      2,
    );
    expect(granted.accepted).toBe(true);
    expect(granted.profile.unlockedCountryIds).toHaveLength(STARTER_COUNTRY_POOL_SIZE);
    expect(granted.profile.unlockedCountryIds).toEqual([STARTER_COUNTRY_ID]);
    expect(granted.profile.commandCredits).toBe(STARTING_COMMAND_CREDITS_V1);
    expect(grantStarterCountriesV1(granted.profile, [STARTER_COUNTRY_ID], 3).accepted).toBe(false);
    const missingCanonicalStarter = grantStarterCountriesV1(
      createCommanderProfileV1(1, 'missing-starter'),
      ['weakest-paid'],
      2,
    );
    expect(missingCanonicalStarter.accepted).toBe(false);
    expect(missingCanonicalStarter.reason).toContain('unavailable');
  });

  it('uses scale-invariant opening Power only to rank the nation roster', () => {
    const strengths = [
      { countryId: 'usa', strength: 10_000 },
      { countryId: 'ind', strength: 6_228.9 },
      { countryId: STARTER_COUNTRY_ID, strength: 27.6 },
      { countryId: 'weakest-paid', strength: 1 },
    ];
    const catalog = buildCountryUnlockCatalogV1(strengths);
    const scaled = buildCountryUnlockCatalogV1(strengths.map((entry) => ({
      ...entry,
      strength: entry.strength * 1_000,
    })));

    expect(catalog.get('usa')?.strengthRank).toBe(1);
    expect(catalog.get('ind')?.strengthRank).toBe(2);
    expect(catalog.get(STARTER_COUNTRY_ID)?.starterEligible).toBe(true);
    expect(catalog.get('weakest-paid')?.strengthRank).toBe(4);
    expect([...catalog].map(([id, quote]) => [id, quote.strengthRank]))
      .toEqual([...scaled].map(([id, quote]) => [id, quote.strengthRank]));
  });

  it('applies the automatic +0.25% only to the opening army and never to the economy', () => {
    const profile = {
      ...createCommanderProfileV1(14, 'mastery-bonus'),
      countryMastery: {
        bel: { xp: countryMasteryXpForLevelV1(3), level: 3, campaigns: 2, victories: 1, bestSurvivalWave: 0 },
      },
      countryUpgrades: {
        bel: { mobilization: 1, logistics: 0, research: 0, economy: 1, trait: 0 },
      },
    };
    const loadout = resolveCountryLoadoutV1(profile, 'bel');
    expect(countryMasteryOpeningBonusV1(1)).toBe(0);
    expect(countryMasteryOpeningBonusV1(3)).toBeCloseTo(0.005, 9);
    expect(countryMasteryOpeningBonusV1(50)).toBeCloseTo(0.1225, 9);
    expect(countryMasteryOpeningBonusV1(MAX_COUNTRY_MASTERY_LEVEL)).toBeCloseTo(0.3725, 9);
    expect(loadout.masteryOpeningArmyMultiplier).toBeCloseTo(1.005, 9);
    expect(loadout.masteryOpeningEconomyMultiplier).toBe(1);
    expect(loadout.openingArmyMultiplier).toBeCloseTo(1.04 * 1.005, 9);
    expect(loadout.openingEconomyMultiplier).toBeCloseTo(1.04, 9);
    expect(loadout.masteryMilitary).toEqual({
      openingArmyMultiplier: 1.005,
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
  });

  it('earns one real mastery point per country level and supports a free military respec', () => {
    const level = 6;
    const profile = normalizeCommanderProfileV1({
      ...createCommanderProfileV1(15, 'country-mastery-points'),
      unlockedCountryIds: ['bel'],
      countryMastery: {
        bel: {
          xp: countryMasteryXpForLevelV1(level),
          level,
          campaigns: 3,
          victories: 1,
          bestSurvivalWave: 0,
        },
      },
    }, 16);
    const openingCredits = profile.commandCredits;
    expect(countryMasteryPointsEarnedV1(level)).toBe(5);
    expect(countryMasteryPointsSpentV1(profile.countryMastery.bel!)).toBe(0);
    expect(countryMasteryPointsAvailableV1(profile.countryMastery.bel!)).toBe(5);

    let allocated = profile;
    for (const track of ['force', 'force', 'firepower', 'defense', 'mobilization'] as const) {
      const result = allocateCountryMasteryPointV1(allocated, 'bel', track, 17);
      expect(result.accepted).toBe(true);
      allocated = result.profile;
    }
    expect(allocateCountryMasteryPointV1(allocated, 'bel', 'force', 18).accepted).toBe(false);
    expect(allocated.commandCredits).toBe(openingCredits);
    expect(allocated.countryMastery.bel!.allocations).toEqual({
      force: 2,
      firepower: 1,
      defense: 1,
      mobilization: 1,
      'land-logistics': 0,
      expeditionary: 0,
      'military-industry': 0,
      'field-medicine': 0,
    });
    expect(countryMasteryPointsAvailableV1(allocated.countryMastery.bel!)).toBe(0);

    const loadout = resolveCountryLoadoutV1(allocated, 'bel');
    expect(loadout.masteryPointsEarned).toBe(5);
    expect(loadout.masteryPointsSpent).toBe(5);
    expect(loadout.masteryPointsAvailable).toBe(0);
    expect(loadout.masteryMilitary).toEqual({
      openingArmyMultiplier: 1.0125,
      armyCapacityMultiplier: 1.02,
      attackMultiplier: 1.015,
      defenseMultiplier: 1.015,
      recruitmentMultiplier: 1.02,
      reserveTrainingMultiplier: 1.025,
      landSupplyMultiplier: 1,
      landTransferThroughputMultiplier: 1,
      navalSupplyMultiplier: 1,
      navalTransferThroughputMultiplier: 1,
      navalTransferCostMultiplier: 1,
      recruitmentCostMultiplier: 1,
      standingOperatingCostMultiplier: 1,
      casualtyMultiplier: 1,
    });

    const respecced = respecCountryMasteryV1(allocated, 'bel', 19);
    expect(respecced.accepted).toBe(true);
    expect(respecced.profile.commandCredits).toBe(openingCredits);
    expect(respecced.profile.countryMastery.bel!.allocations).toEqual({
      force: 0, firepower: 0, defense: 0, mobilization: 0,
      'land-logistics': 0, expeditionary: 0,
      'military-industry': 0, 'field-medicine': 0,
    });
    expect(countryMasteryPointsAvailableV1(respecced.profile.countryMastery.bel!)).toBe(5);
  });

  it('normalizes old and overspent country mastery into deterministic unspent points', () => {
    const level = 4;
    const base = createCommanderProfileV1(20, 'legacy-country-mastery');
    const legacy = normalizeCommanderProfileV1({
      ...base,
      unlockedCountryIds: ['bel'],
      countryMastery: {
        bel: {
          xp: countryMasteryXpForLevelV1(level),
          level,
          campaigns: 2,
          victories: 0,
          bestSurvivalWave: 0,
        },
      },
    }, 21);
    expect(legacy.countryMastery.bel!.allocations).toEqual({
      force: 0, firepower: 0, defense: 0, mobilization: 0,
      'land-logistics': 0, expeditionary: 0,
      'military-industry': 0, 'field-medicine': 0,
    });
    expect(countryMasteryPointsAvailableV1(legacy.countryMastery.bel!)).toBe(3);

    const overspent = normalizeCommanderProfileV1({
      ...legacy,
      countryMastery: {
        bel: {
          ...legacy.countryMastery.bel!,
          allocations: { force: 2, firepower: 2, defense: 99, mobilization: 99 },
        },
      },
    }, 22);
    expect(overspent.countryMastery.bel!.allocations).toEqual({
      force: 2, firepower: 1, defense: 0, mobilization: 0,
      'land-logistics': 0, expeditionary: 0,
      'military-industry': 0, 'field-medicine': 0,
    });
    expect(countryMasteryPointsSpentV1(overspent.countryMastery.bel!)).toBe(3);
    expect(countryMasteryLevelFromXpV1(
      countryMasteryXpForLevelV1(MAX_COUNTRY_MASTERY_LEVEL),
    )).toBe(MAX_COUNTRY_MASTERY_LEVEL);
  });

  it('publishes the exact high-impact military value of every repeatable point', () => {
    expect(resolveCountryMasteryMilitaryEffectsV1(5, {
      force: 1, firepower: 1, defense: 1, mobilization: 1,
    })).toEqual({
      openingArmyMultiplier: 1.01,
      armyCapacityMultiplier: 1 + COUNTRY_MASTERY_FORCE_CAPACITY_PER_POINT_V1,
      attackMultiplier: 1 + COUNTRY_MASTERY_FIREPOWER_PER_POINT_V1,
      defenseMultiplier: 1 + COUNTRY_MASTERY_DEFENSE_PER_POINT_V1,
      recruitmentMultiplier: 1 + COUNTRY_MASTERY_RECRUITMENT_PER_POINT_V1,
      reserveTrainingMultiplier: 1 + COUNTRY_MASTERY_RESERVE_TRAINING_PER_POINT_V1,
      landSupplyMultiplier: 1,
      landTransferThroughputMultiplier: 1,
      navalSupplyMultiplier: 1,
      navalTransferThroughputMultiplier: 1,
      navalTransferCostMultiplier: 1,
      recruitmentCostMultiplier: 1,
      standingOperatingCostMultiplier: 1,
      casualtyMultiplier: 1,
    });
    expect(resolveCountryMasteryMilitaryEffectsV1(150, { force: 149 }))
      .toMatchObject({
        openingArmyMultiplier: 1.3725,
        armyCapacityMultiplier: 2.49,
      });
    expect(resolveCountryMasteryMilitaryEffectsV1(5, {
      'land-logistics': 1,
      expeditionary: 1,
      'military-industry': 1,
      'field-medicine': 1,
    })).toMatchObject({
      landSupplyMultiplier: 1.02,
      landTransferThroughputMultiplier: 1.015,
      navalSupplyMultiplier: 1.015,
      navalTransferThroughputMultiplier: 1.01,
      navalTransferCostMultiplier: 0.995,
      recruitmentCostMultiplier: 0.99,
      standingOperatingCostMultiplier: 0.9925,
      casualtyMultiplier: 0.99,
    });
  });

  it('silently unlocks defeated nations only in the standard Campaign', () => {
    const starterQuote = countryUnlockQuoteV1(STARTER_COUNTRY_ID, 166, 196);
    const endgameQuote = countryUnlockQuoteV1('usa', 1, 196);
    const profile = createCommanderProfileV1(20, 'campaign-gate');

    expect(isCountryAvailableToUnlockV1(profile, starterQuote)).toBe(true);
    expect(isCountryAvailableToUnlockV1(profile, endgameQuote)).toBe(false);
    const blocked = unlockCountryV1(profile, endgameQuote, 21);
    expect(blocked.accepted).toBe(false);
    expect(blocked.reason).toContain('Defeat this nation in Campaign');

    const purgeOnly = recordCampaignSignalPurgedCountriesV1(
      profile,
      ['usa', ' usa ', '', 'mex', 'mex'],
      22,
    );
    expect(purgeOnly.accepted).toBe(false);
    expect(purgeOnly.profile).toBe(profile);
    expect(purgeOnly.newlyUnlockedCountryIds).toEqual([]);

    for (const mode of ['survival', 'random-world'] as const) {
      const ignored = recordCampaignDefeatedCountriesV1(profile, ['usa', 'mex'], mode, 23);
      expect(ignored.accepted).toBe(false);
      expect(ignored.profile).toBe(profile);
      expect(ignored.newlyUnlockedCountryIds).toEqual([]);
    }

    const recorded = recordCampaignDefeatedCountriesV1(
      profile,
      ['usa', ' usa ', '', 'mex', 'mex'],
      'standard-2026',
      24,
    );
    expect(recorded.accepted).toBe(true);
    expect(recorded.newlyUnlockedCountryIds).toEqual(['mex', 'usa']);
    expect(recorded.newlyAvailableCountryIds).toEqual(['mex', 'usa']);
    expect(recorded.profile.defeatedCountryIds).toEqual(['mex', 'usa']);
    expect(recorded.profile.unlockedCountryIds).toEqual(['mex', 'usa']);
    expect(recorded.profile.countryMastery).toHaveProperty('usa');
    expect(recorded.profile.countryUpgrades).toHaveProperty('mex');
    expect(recorded.profile.pendingCountryUnlockNotificationIds).toEqual([]);
    expect(recorded.profile.commandCredits).toBe(STARTING_COMMAND_CREDITS_V1);
    expect(isCountryAvailableToUnlockV1(recorded.profile, endgameQuote)).toBe(true);

    const retry = recordCampaignDefeatedCountriesV1(
      recorded.profile, ['usa', 'mex'], 'standard-2026', 25,
    );
    expect(retry.accepted).toBe(false);
    expect(retry.newlyUnlockedCountryIds).toEqual([]);
    expect(retry.newlyAvailableCountryIds).toEqual([]);
    expect(retry.profile).toBe(recorded.profile);
  });

  it('normalizes old profiles without Campaign defeat history safely', () => {
    const oldProfile = createCommanderProfileV1(30, 'old-profile') as Partial<ReturnType<typeof createCommanderProfileV1>>;
    delete oldProfile.defeatedCountryIds;
    delete oldProfile.pendingCountryUnlockNotificationIds;
    delete oldProfile.empireName;
    delete oldProfile.empireFlag;
    delete oldProfile.activeDoctrine;
    const normalized = normalizeCommanderProfileV1(oldProfile, 31);
    expect(normalized.defeatedCountryIds).toEqual([]);
    expect(normalized.pendingCountryUnlockNotificationIds).toEqual([]);
    expect(normalized.empireName).toBe('Frontier Alliance');
    expect(normalized.empireFlag).toEqual({ kind: 'country', countryId: STARTER_COUNTRY_ID });
    expect(normalized.activeDoctrine).toBeNull();
  });

  it('selects and persists any authored country flag as account-wide empire identity', () => {
    const storage = new MemoryStorage();
    const profile = createCommanderProfileV1(32, 'empire-flag');
    expect(profile.empireFlag).toEqual({ kind: 'country', countryId: STARTER_COUNTRY_ID });

    const selected = selectEmpireFlagV1(
      profile,
      { kind: 'country', countryId: 'JPN' },
      ['grl', 'jpn', 'usa'],
      33,
    );
    expect(selected.accepted).toBe(true);
    expect(selected.profile.empireFlag).toEqual({ kind: 'country', countryId: 'jpn' });
    expect(selected.profile.unlockedCountryIds).not.toContain('jpn');
    expect(loadCommanderProfileV1(
      storage,
      34,
    ).empireFlag.countryId).toBe(STARTER_COUNTRY_ID);
    saveCommanderProfileV1(storage, selected.profile);
    expect(loadCommanderProfileV1(storage, 35).empireFlag)
      .toEqual({ kind: 'country', countryId: 'jpn' });

    const rejected = selectEmpireFlagV1(
      selected.profile,
      { kind: 'country', countryId: 'missing' },
      ['grl', 'jpn', 'usa'],
      36,
    );
    expect(rejected.accepted).toBe(false);
    expect(rejected.profile).toBe(selected.profile);
  });

  it('persists a normalized account empire identity without spending credits', () => {
    const profile = createCommanderProfileV1(32, 'empire-name');
    const renamed = renameEmpireV1(profile, '  Northern   Star Union  ', 33);
    expect(renamed.accepted).toBe(true);
    expect(renamed.profile.empireName).toBe('Northern Star Union');
    expect(renamed.profile.commandCredits).toBe(profile.commandCredits);
    expect(normalizeCommanderProfileV1(renamed.profile, 34).empireName).toBe('Northern Star Union');

    const rejected = renameEmpireV1(renamed.profile, '<script>', 35);
    expect(rejected.accepted).toBe(false);
    expect(rejected.profile).toBe(renamed.profile);
  });

  it.each([
    {
      label: 'instant Campaign with no progress', active: false,
      input: {
        campaignId: 'pace-instant', countryId: 'gnb', mode: 'standard-2026', outcome: 'defeat',
        weeksSurvived: 1, territoriesGained: 0, warsWon: 0,
        highestSurvivalWave: 0, militaryLosses: 0,
      } as const,
    },
    {
      label: 'meaningful early Campaign', active: true,
      input: {
        campaignId: 'pace-early-campaign', countryId: 'gnb', mode: 'standard-2026', outcome: 'defeat',
        weeksSurvived: 52, territoriesGained: 1, warsWon: 0,
        highestSurvivalWave: 0, militaryLosses: 0.25,
      } as const,
    },
    {
      label: 'good early Survival', active: true,
      input: {
        campaignId: 'pace-early-survival', countryId: 'gnb', mode: 'survival', outcome: 'surrender',
        weeksSurvived: 52, territoriesGained: 1, warsWon: 0,
        highestSurvivalWave: 2, verifiedRogueWaveLosses: 0.004, militaryLosses: 0.25,
      } as const,
    },
    {
      label: 'established mid Campaign', active: true,
      input: {
        campaignId: 'pace-mid-campaign', countryId: 'gnb', mode: 'standard-2026', outcome: 'defeat',
        weeksSurvived: 260, territoriesGained: 5, warsWon: 3,
        highestSurvivalWave: 0, militaryLosses: 1,
      } as const,
    },
    {
      label: 'deep Survival victory', active: true,
      input: {
        campaignId: 'pace-deep-survival', countryId: 'gnb', mode: 'survival', outcome: 'victory',
        weeksSurvived: 1_040, territoriesGained: 20, warsWon: 12,
        highestSurvivalWave: 18, verifiedRogueWaveLosses: 10, militaryLosses: 5,
      } as const,
    },
  ])('settles $label with progression pacing', ({ input, active }) => {
    const reward = calculateCampaignRewardV1(input);
    expect(reward).not.toHaveProperty('totalReward');
    expect(reward).not.toHaveProperty('baseReward');
    expect(reward.masteryXp > 0).toBe(active);
    expect(reward.commanderXp > 0).toBe(active);
    expect(reward.creditsEarned > 0).toBe(active && input.mode === 'standard-2026');
    if (input.campaignId.includes('early')) {
      expect(reward.masteryXp).toBeGreaterThanOrEqual(countryMasteryXpForLevelV1(2));
      expect(reward.masteryXp).toBeLessThan(countryMasteryXpForLevelV1(3));
      expect(reward.commanderXp).toBeGreaterThanOrEqual(commanderXpForLevelV1(2));
      expect(reward.commanderXp).toBeLessThan(commanderXpForLevelV1(3));
    }
  });

  it('guarantees one new progression choice after the smallest genuinely active first timeline', () => {
    const reward = calculateCampaignRewardV1({
      campaignId: 'first-meaningful-timeline', countryId: STARTER_COUNTRY_ID,
      mode: 'standard-2026', outcome: 'defeat', weeksSurvived: 8,
      territoriesGained: 0, warsWon: 0, warsFought: 1,
      highestSurvivalWave: 0, militaryLosses: 0.01,
    });

    expect(reward.commanderXp).toBeGreaterThanOrEqual(commanderXpForLevelV1(2));
    expect(reward.commanderXp).toBeLessThan(commanderXpForLevelV1(3));
    expect(reward.masteryXp).toBeGreaterThanOrEqual(countryMasteryXpForLevelV1(2));
    expect(reward.masteryXp).toBeLessThan(countryMasteryXpForLevelV1(3));
  });

  it('keeps XP in eligible modes but awards Credits only in Campaign', () => {
    const common = {
      campaignId: 'campaign-1',
      countryId: 'bel',
      weeksSurvived: 260,
      territoriesGained: 3,
      warsWon: 2,
      highestSurvivalWave: 4,
      militaryLosses: 1,
    } as const;
    const standardDefeat = calculateCampaignRewardV1({
      ...common, mode: 'standard-2026', outcome: 'defeat',
    });
    const survivalVictory = calculateCampaignRewardV1({
      ...common, mode: 'survival', outcome: 'victory',
    });
    expect(standardDefeat.commanderXp).toBeGreaterThan(0);
    expect(standardDefeat.masteryXp).toBeGreaterThan(0);
    expect(survivalVictory.commanderXp).toBeGreaterThan(0);
    expect(survivalVictory.masteryXp).toBeGreaterThan(0);
    expect(standardDefeat.creditsEarned).toBeGreaterThan(0);
    expect(survivalVictory.creditsEarned).toBe(0);

    const starterOwned = grantStarterCountriesV1(
      createCommanderProfileV1(1, 'test'),
      [STARTER_COUNTRY_ID],
      2,
    ).profile;
    const owned = { ...starterOwned, unlockedCountryIds: [STARTER_COUNTRY_ID, 'bel'] };
    const claimed = claimCampaignRewardV1(owned, survivalVictory, 3);
    expect(claimed.accepted).toBe(true);
    expect(claimed.profile.commandCredits).toBe(STARTING_COMMAND_CREDITS_V1);
    expect(claimed.profile.commanderXp).toBe(survivalVictory.commanderXp);
    expect(claimed.profile.countryMastery.bel?.xp).toBe(survivalVictory.masteryXp);
    expect(claimed.profile.transactions.at(-1)?.campaignId).toBe('campaign-1');
    expect(claimCampaignRewardV1(claimed.profile, survivalVictory, 4).accepted).toBe(false);
  });

  it('keeps verified post-launch Rogue losses a small bounded XP contribution', () => {
    const input = {
      countryId: 'gnb', mode: 'survival' as const, outcome: 'defeat' as const,
      weeksSurvived: 104, territoriesGained: 0, warsWon: 0,
      highestSurvivalWave: 4, militaryLosses: 0.5,
    };
    const placeholderOnly = calculateCampaignRewardV1({
      ...input, campaignId: 'placeholder-only', verifiedRogueWaveLosses: 0,
    });
    const tinyVerified = calculateCampaignRewardV1({
      ...input, campaignId: 'tiny-verified', verifiedRogueWaveLosses: 0.004,
    });
    const extremeVerified = calculateCampaignRewardV1({
      ...input, campaignId: 'extreme-verified', verifiedRogueWaveLosses: 10_000,
    });

    expect(placeholderOnly.verifiedRogueWaveLosses).toBe(0);
    expect(tinyVerified.masteryXp - placeholderOnly.masteryXp).toBeLessThanOrEqual(1);
    expect(extremeVerified.masteryXp - placeholderOnly.masteryXp).toBeLessThanOrEqual(11);
    expect(extremeVerified.commanderXp - placeholderOnly.commanderXp).toBeLessThanOrEqual(7);
  });

  it('keeps Alternative Universe completely outside account progression', () => {
    const common = {
      campaignId: 'chaos-reward', countryId: 'bel', outcome: 'victory' as const,
      weeksSurvived: 156, territoriesGained: 4, warsWon: 3,
      highestSurvivalWave: 0, militaryLosses: 2,
    };
    const alternative = calculateCampaignRewardV1({ ...common, mode: 'random-world' });
    expect(alternative.modeMultiplier).toBe(0);
    expect(alternative.masteryXp).toBe(0);
    expect(alternative.commanderXp).toBe(0);
    expect(alternative.creditsEarned).toBe(0);
    expect(alternative).not.toHaveProperty('totalReward');

    const owned = grantStarterCountriesV1(
      createCommanderProfileV1(1, 'alt-claim'),
      [STARTER_COUNTRY_ID],
      2,
    ).profile;
    const snapshotBefore = structuredClone(owned);
    const rejected = claimCampaignRewardV1(owned, alternative, 3);
    expect(rejected.accepted).toBe(false);
    expect(rejected.reason).toContain('no account progression');
    expect(rejected.profile).toBe(owned);
    expect(owned).toEqual(snapshotBefore);
  });

  it('grants one free shield point per APEX level and keeps capstone protocols exclusive', () => {
    const talents = emptyCommanderTalentsV1();
    talents['elite-vanguard'] = 5;
    talents['volunteer-brigade'] = 3;
    talents['science-corps'] = 3;
    talents['treasury-reserve'] = 3;
    talents['civil-defense'] = 3;
    talents['frugal-quartermaster'] = 5;
    talents['doctrine-command'] = 5;
    talents['theater-network'] = 5;
    talents['reserve-cadre'] = 1;
    const profile = normalizeCommanderProfileV1({
      ...createCommanderProfileV1(40, 'milestones'),
      commanderXp: commanderXpForLevelV1(33),
      commanderTalents: talents,
      commandCredits: 777,
    }, 41);
    expect(profile.commanderLevel).toBe(33);
    expect(profile.commandCredits).toBe(STARTING_COMMAND_CREDITS_V1);
    expect(commanderTalentPointsAvailableV1(profile)).toBe(0);
    expect(profile.activeDoctrine).toBeNull();

    const vanguard = selectCommanderDoctrineV1(profile, 'vanguard', 42);
    expect(vanguard.accepted).toBe(true);
    const initialization = resolveCommanderForceInitializationV1(
      resolveCountryLoadoutV1(vanguard.profile, 'bel'),
    );
    expect(initialization.capabilities).toEqual({
      mobileHeadquarters: false,
      fieldHospital: false,
      rapidResponse: false,
      forceMultiplier: false,
      assaultSpecialist: true,
      defenseSpecialist: false,
      emergencyExtractionCharges: 0,
    });
    expect(initialization.shield.integrity).toBe(initialization.shield.maxIntegrity);
    expect(initialization.attackMultiplier).toBe(1.12);
    expect(initialization.defenseMultiplier).toBe(1.07);
    expect(initialization.empireSupport).toMatchObject({
      annualFoodOutput: 0,
      foodProductionMultiplier: 1,
      foodStorageMultiplier: 1,
      foodImportCostMultiplier: 1,
    });
    expect(resolveCommanderTalentEffectsV1(talents)).not.toHaveProperty('activeManpower');

    const bastion = selectCommanderDoctrineV1(profile, 'bastion', 43);
    expect(bastion.accepted).toBe(true);
    expect(resolveCommanderForceInitializationV1(
      resolveCountryLoadoutV1(bastion.profile, 'bel'),
    ).capabilities).toMatchObject({
      rapidResponse: false,
      assaultSpecialist: false,
      defenseSpecialist: true,
    });
    const rapidResponse = selectCommanderDoctrineV1(profile, 'rapid-response', 44);
    expect(rapidResponse.accepted).toBe(true);
    expect(resolveCommanderForceInitializationV1(
      resolveCountryLoadoutV1(rapidResponse.profile, 'bel'),
    ).capabilities).toMatchObject({
      fieldHospital: true,
      rapidResponse: false,
      assaultSpecialist: false,
      defenseSpecialist: false,
    });
    const forceMultiplier = selectCommanderDoctrineV1(profile, 'force-multiplier', 45);
    expect(forceMultiplier.accepted).toBe(true);
    expect(resolveCommanderForceInitializationV1(
      resolveCountryLoadoutV1(forceMultiplier.profile, 'bel'),
    ).capabilities).toMatchObject({ forceMultiplier: true });

    const lockedDoctrine = selectCommanderDoctrineV1(
      createCommanderProfileV1(45, 'locked-doctrine'),
      'bastion',
      46,
    );
    expect(lockedDoctrine.accepted).toBe(false);
    expect(lockedDoctrine.reason).toContain('Requires Countermeasure Core Rank 5');
    const forgedLockedDoctrine = selectCommanderDoctrineV1({
      ...createCommanderProfileV1(46, 'forged-doctrine'),
      commanderTalents: {
        ...emptyCommanderTalentsV1(),
        'doctrine-command': 999,
      },
    }, 'bastion', 47);
    expect(forgedLockedDoctrine.accepted).toBe(false);
    expect(forgedLockedDoctrine.reason).toContain('Requires Countermeasure Core Rank 5');

    const onePointProfile = normalizeCommanderProfileV1({
      ...createCommanderProfileV1(48, 'free-point'),
      commanderXp: commanderXpForLevelV1(2),
    }, 49);
    const allocated = allocateCommanderTalentV1(onePointProfile, 'science-corps', 50);
    expect(allocated.accepted).toBe(true);
    expect(allocated.profile.commandCredits).toBe(onePointProfile.commandCredits);
    expect(allocated.profile.transactions.at(-1)).toMatchObject({
      kind: 'commander-talent', amount: 0, talentId: 'science-corps',
    });
  });

  it('starts with one full energy shield and resolves only shield and national-Army modifiers', () => {
    const defaultInitialization = resolveCommanderForceInitializationV1(
      resolveCountryLoadoutV1(createCommanderProfileV1(54, 'base-elite'), 'bel'),
    );
    expect(defaultInitialization).toMatchObject({
      shield: {
        integrity: BASE_COMMANDER_FORCE_V1.integrity,
        maxIntegrity: BASE_COMMANDER_FORCE_V1.maxIntegrity,
        rechargeBuffer: BASE_COMMANDER_FORCE_V1.rechargeBuffer,
        rechargeMultiplier: 1,
        pulseAttack: BASE_COMMANDER_FORCE_V1.pulseAttack,
      },
      attackMultiplier: BASE_COMMANDER_FORCE_V1.attackMultiplier,
      defenseMultiplier: BASE_COMMANDER_FORCE_V1.defenseMultiplier,
      armyCasualtyMultiplier: 1,
      armyPeaceRecoveryMultiplier: 1,
    });
    expect(defaultInitialization.shield.integrity).toBe(0.001);
    expect(defaultInitialization.shield.maxIntegrity).toBe(0.001);
    expect(defaultInitialization.shield.rechargeBuffer).toBe(0.00004);
    expect(defaultInitialization.shield.pulseAttack).toBe(0.001);
    expect(defaultInitialization.treasury).toBe(0);
    expect(defaultInitialization.annualOutput).toBe(0.015);
    expect(defaultInitialization).not.toHaveProperty('army');
    expect(defaultInitialization).not.toHaveProperty('manpower');
    expect(defaultInitialization).not.toHaveProperty('capacity');

    const allRanks = Object.fromEntries(
      COMMANDER_TALENTS_V1.map((talent) => [talent.id, talent.coreRank]),
    );
    const effects = resolveCommanderTalentEffectsV1(allRanks);
    expect(effects).toMatchObject({
      maxIntegrityBonus: 0.36,
      rechargeBufferBonus: 0.18,
      rechargeRateBonus: 0.36,
      armyAttackBonus: 0.099,
      pulseAttackBonus: 0.36,
      pulseProjectionRetention: 0.063,
      pulseChargeBonusPerStep: 0.09,
      interceptEfficiencyBonus: 0.09,
      impactRecoveryShare: 0.063,
      defensivePulseBonus: 0.18,
      armyDefenseBonus: 0.072,
      armyCasualtyReduction: 0,
      armyPeaceRecoveryBonus: 0.225,
    });
    expect(effects).not.toHaveProperty('treasury');
    expect(effects).not.toHaveProperty('annualOutput');
    expect(effects).not.toHaveProperty('empireAnnualFoodOutputBonus');
    expect(effects).not.toHaveProperty('empireFoodProductionBonus');
    expect(effects).not.toHaveProperty('activeManpower');
    expect(effects).not.toHaveProperty('capacity');
    expect(effects).not.toHaveProperty('trainedReserves');

    const interceptionOnly = resolveCommanderTalentEffectsV1({ 'volunteer-brigade': 5 });
    expect(interceptionOnly.interceptEfficiencyBonus).toBeGreaterThan(0);
    expect(interceptionOnly.armyDefenseBonus).toBe(0);
    expect(interceptionOnly.maxIntegrityBonus).toBe(0);
    const integrityOnly = resolveCommanderTalentEffectsV1({ 'reserve-cadre': 5 });
    expect(integrityOnly.maxIntegrityBonus).toBeGreaterThan(0);
    expect(integrityOnly.armyAttackBonus).toBe(0);
    expect(resolveCommanderTalentEffectsV1({ 'reserve-cadre': 1 }).maxIntegrityBonus)
      .toBeCloseTo(0.005, 4);
    expect(integrityOnly.maxIntegrityBonus).toBeCloseTo(0.0372, 4);

    const levelSixtySeven = commanderXpForLevelV1(67);
    const sameLevelBase = normalizeCommanderProfileV1({
      ...createCommanderProfileV1(55, 'full-strength-base'),
      commanderXp: levelSixtySeven,
    }, 56);
    const sameLevelForce = resolveCommanderForceInitializationV1(
      resolveCountryLoadoutV1(sameLevelBase, 'bel'),
    );
    const forceSizeTalents = emptyCommanderTalentsV1();
    forceSizeTalents['reserve-cadre'] = 15;
    const upgradedForce = resolveCommanderForceInitializationV1(resolveCountryLoadoutV1(
      normalizeCommanderProfileV1({
        ...createCommanderProfileV1(57, 'full-strength-upgraded'),
        commanderXp: levelSixtySeven,
        commanderTalents: forceSizeTalents,
      }, 58),
      'bel',
    ));
    expect(sameLevelForce.shield.integrity).toBe(sameLevelForce.shield.maxIntegrity);
    expect(upgradedForce.shield.integrity).toBe(upgradedForce.shield.maxIntegrity);
    expect(upgradedForce.shield.maxIntegrity).toBeGreaterThan(sameLevelForce.shield.maxIntegrity);
    expect(upgradedForce.attackMultiplier).toBe(sameLevelForce.attackMultiplier);
    expect(upgradedForce.annualOutput).toBe(sameLevelForce.annualOutput);
    expect(upgradedForce.treasury).toBe(sameLevelForce.treasury);

    const levelTenLoadout = resolveCountryLoadoutV1(
      createCommanderProfileV1(55, 'level-economy'),
      'bel',
    );
    levelTenLoadout.commanderLevel = 10;
    expect(resolveCommanderForceInitializationV1(levelTenLoadout).annualOutput)
      .toBeCloseTo(0.01545, 9);
  });

  it('grows Energy from a low convex core into a safe endless account-level tail', () => {
    const noTalents = emptyCommanderTalentsV1();
    const at = (level: number): number => commanderMaxIntegrityV1(level, noTalents);
    expect(at(1)).toBe(BASE_COMMANDER_FORCE_V1.maxIntegrity);
    expect(commanderLevelMaxIntegrityBonusV1(1)).toBe(0);
    expect(at(2)).toBeGreaterThan(at(1));
    expect(at(50)).toBeCloseTo(BASE_COMMANDER_FORCE_V1.maxIntegrity * 12, 9);

    const earlyCoreGain = at(3) - at(2);
    const middleCoreGain = at(26) - at(25);
    const lateCoreGain = at(50) - at(49);
    expect(earlyCoreGain).toBeGreaterThan(0);
    expect(middleCoreGain).toBeGreaterThan(earlyCoreGain);
    expect(lateCoreGain).toBeGreaterThan(middleCoreGain);

    const checkpoints = [1, 2, 10, 25, 49, 50, 51, 100, 250, 10_000, Number.MAX_SAFE_INTEGER];
    const integrity = checkpoints.map(at);
    for (let index = 1; index < integrity.length; index += 1) {
      expect(integrity[index]).toBeGreaterThan(integrity[index - 1]!);
    }
    expect(integrity.every(Number.isFinite)).toBe(true);
    expect(at(Number.MAX_SAFE_INTEGER))
      .toBeLessThan(BASE_COMMANDER_FORCE_V1.maxIntegrity * 120);

    const shieldTalents = emptyCommanderTalentsV1();
    shieldTalents['reserve-cadre'] = 15;
    expect(commanderMaxIntegrityV1(50, shieldTalents)).toBeGreaterThan(at(50));
  });

  it('keeps level-one Greenland useful but makes a veteran shield relevant at France scale', () => {
    // Canonical 2026 openings: Greenland 300 active personnel with its 12x
    // human challenge start; France 264,000 active personnel.
    const greenlandOpeningArmy = 0.0003 * 12;
    const franceOpeningArmy = 0.264;
    const levelOneShield = commanderMaxIntegrityV1(1, emptyCommanderTalentsV1());
    const levelFiftyShield = commanderMaxIntegrityV1(50, emptyCommanderTalentsV1());

    expect(levelOneShield).toBeLessThan(greenlandOpeningArmy);
    expect(levelOneShield / greenlandOpeningArmy).toBeGreaterThan(0.27);
    expect(levelOneShield / greenlandOpeningArmy).toBeLessThan(0.29);
    expect(levelFiftyShield / franceOpeningArmy).toBeGreaterThan(0.04);
    expect(levelFiftyShield / franceOpeningArmy).toBeLessThan(0.05);
    expect(levelFiftyShield).toBeLessThan(franceOpeningArmy);
    const levelOnePulse = commanderPulseAttackV1(1, emptyCommanderTalentsV1());
    const levelFiftyPulse = commanderPulseAttackV1(50, emptyCommanderTalentsV1());
    expect(levelOnePulse / greenlandOpeningArmy).toBeGreaterThan(0.25);
    expect(levelFiftyPulse / franceOpeningArmy).toBeGreaterThan(0.06);
    expect(levelFiftyPulse).toBeLessThan(franceOpeningArmy * 0.10);
  });

  it('authors three distinct APEX branches and exactly one national-Army branch', () => {
    const copy = JSON.stringify(COMMANDER_TALENTS_V1.map((talent) => ({
      label: talent.label,
      description: talent.description,
      perRank: talent.perRank,
      milestones: talent.milestones,
      synergy: talent.synergy,
    })));
    expect(copy).not.toMatch(/soldier|personnel|troop|manpower|trained reserve|corps|brigade|cadre|quartermaster|barracks|hospital|treasury|income|food|research/i);
    expect(COMMANDER_TALENTS_V1.map((talent) => talent.label)).toEqual([
      'Pulse Output', 'Front Projection', 'Pulse Charge',
      'Energy Efficiency', 'Impact Recovery', 'Defense Pulse',
      'Max Energy', 'Energy Recharge', 'Reserve Energy',
      'Army Attack', 'Army Defense', 'Peace Recovery',
    ]);
    expect(COMMANDER_TALENTS_V1.map(({ branch, tier }) => `${branch}:${tier}`)).toEqual([
      'offensive:1', 'offensive:2', 'offensive:3',
      'defensive:1', 'defensive:2', 'defensive:3',
      'shield-core:1', 'shield-core:2', 'shield-core:3',
      'military-command:1', 'military-command:2', 'military-command:3',
    ]);
    expect(COMMANDER_TALENTS_V1.find((talent) => talent.id === 'science-corps')?.perRank)
      .toBe('+2% Pulse Attack per effective rank. Shared Pulse ceiling: +200%.');
    expect(COMMANDER_TALENTS_V1.find((talent) => talent.id === 'elite-vanguard')?.milestones[2]?.description)
      .toBe('+9% Pulse per stored charge.');
    expect(COMMANDER_TALENTS_V1.find((talent) => talent.id === 'civil-defense')?.milestones[2]?.description)
      .toBe('Recovers 6.30% of spent Energy to Reserve.');
    expect(COMMANDER_TALENTS_V1.find((talent) => talent.id === 'theater-network')?.milestones[0]?.description)
      .toContain('+20% shared Army buff pool per extra front, capped at 140%');
    expect(COMMANDER_DOCTRINES_V1.map(({ label, description }) => `${label}: ${description}`)).toEqual([
      'Overdrive: Every third supported attack doubles APEX Pulse Attack only, then spends 2% Max Energy. Army Attack never changes.',
      'Countermeasure: Returns 15% of damage actually intercepted by APEX, within the hostile Army’s remaining 10% hit budget.',
      'Emergency Reboot: Once per campaign, reaching 0% Energy immediately restores 20% after the battle. An Army at zero still loses.',
      'Theater Mesh: Each additional front adds 20% to the shared national Army buff pool, capped at 140%, then divides it across all fronts.',
    ]);
  });

  it('gates concentrated talent ranks by APEX level while keeping points distributable', () => {
    expect([1, 2, 3, 4, 5, 6, 10, 11, 15, 16].map(
      commanderTalentRankLevelRequirementV1,
    )).toEqual([1, 2, 3, 5, 7, 11, 27, 35, 67, 79]);

    let levelFifteen = normalizeCommanderProfileV1({
      ...createCommanderProfileV1(60, 'rank-gates'),
      commanderXp: commanderXpForLevelV1(15),
    }, 61);
    for (let rank = 1; rank <= 3; rank += 1) {
      const result = allocateCommanderTalentV1(levelFifteen, 'science-corps', 61 + rank);
      expect(result.accepted, result.reason).toBe(true);
      levelFifteen = result.profile;
    }
    const blockedDump = allocateCommanderTalentV1(levelFifteen, 'science-corps', 70);
    expect(blockedDump).toMatchObject({
      accepted: false,
      reason: 'Invest 1 total points in other nodes first (0/1).',
    });
    for (const talentId of [
      'volunteer-brigade', 'science-corps', 'reserve-cadre', 'science-corps',
      'volunteer-brigade', 'reserve-cadre', 'mobile-logistics', 'volunteer-brigade',
      'reserve-cadre', 'mobile-logistics', 'science-corps', 'mobile-logistics',
    ] as const) {
      const distributed = allocateCommanderTalentV1(levelFifteen, talentId, 71);
      expect(distributed.accepted, distributed.reason).toBe(true);
      levelFifteen = distributed.profile;
    }
    expect(commanderTalentPointsAvailableV1(levelFifteen)).toBe(0);

    let levelSixtySeven = normalizeCommanderProfileV1({
      ...createCommanderProfileV1(62, 'rank-fifteen'),
      commanderXp: commanderXpForLevelV1(67),
      commanderTalents: {
        ...emptyCommanderTalentsV1(),
        'science-corps': 3,
        'volunteer-brigade': 3,
        'reserve-cadre': 3,
      },
    }, 63);
    for (let rank = 1; rank <= 15; rank += 1) {
      const result = allocateCommanderTalentV1(levelSixtySeven, 'treasury-reserve', 80 + rank);
      expect(result.accepted, result.reason).toBe(true);
      levelSixtySeven = result.profile;
    }
    expect(levelSixtySeven.commanderTalents['treasury-reserve']).toBe(15);

    const legacy = normalizeCommanderProfileV1({
      ...createCommanderProfileV1(64, 'legacy-high-rank'),
      commanderXp: commanderXpForLevelV1(25),
      commanderTalents: {
        ...emptyCommanderTalentsV1(),
        'treasury-reserve': 25,
      },
    }, 65);
    expect(legacy.commanderTalents['treasury-reserve']).toBe(25);
  });

  it('opens four useful roots at level one and reports prerequisite and breadth gates exactly', () => {
    const levelOne = createCommanderProfileV1(66, 'branch-gates');
    expect(['science-corps', 'volunteer-brigade', 'reserve-cadre', 'mobile-logistics'].map((talentId) => (
      commanderTalentAllocationQuoteV1(levelOne, talentId as keyof typeof levelOne.commanderTalents)
        .available
    ))).toEqual([true, true, true, true]);

    const targeting = commanderTalentAllocationQuoteV1(levelOne, 'treasury-reserve');
    expect(targeting).toMatchObject({
      available: false,
      unmetPrerequisite: {
        talentId: 'science-corps',
        rank: 3,
        label: 'Pulse Output',
      },
      reason: 'Requires Pulse Output Rank 3 before Front Projection.',
    });
    const blocked = allocateCommanderTalentV1(levelOne, 'treasury-reserve', 67);
    expect(blocked.accepted).toBe(false);
    expect(blocked.reason).toBe(targeting.reason);

    const migrated = normalizeCommanderProfileV1({
      ...createCommanderProfileV1(68, 'legacy-tree'),
      commanderXp: commanderXpForLevelV1(100),
      commanderTalents: {
        ...emptyCommanderTalentsV1(),
        'treasury-reserve': 12,
      },
    }, 69);
    expect(migrated.commanderTalents['treasury-reserve']).toBe(12);
    expect(commanderTalentAllocationQuoteV1(migrated, 'treasury-reserve')).toMatchObject({
      targetRank: 13,
      available: false,
      unmetBreadth: { current: 0, required: 5, scope: 'other-nodes' },
    });
  });

  it('uses one convex curve while keeping all four talent branches mechanically isolated', () => {
    const earlyGeneral = commanderTalentCurveV1(1);
    const middleGeneral = commanderTalentCurveV1(10);
    const coreGeneral = commanderTalentCurveV1(15);
    expect(earlyGeneral).toBeGreaterThan(0);
    expect(earlyGeneral).toBeLessThan(1);
    expect(middleGeneral).toBeLessThan(10);
    expect(coreGeneral).toBe(18);
    expect(commanderTalentCurveV1(15) - commanderTalentCurveV1(14))
      .toBeGreaterThan(commanderTalentCurveV1(2) - commanderTalentCurveV1(1));

    const earlyTargeting = resolveCommanderTalentEffectsV1({ 'treasury-reserve': 1 });
    const coreTargeting = resolveCommanderTalentEffectsV1({ 'treasury-reserve': 15 });
    const endlessTargeting = resolveCommanderTalentEffectsV1({ 'treasury-reserve': 100 });
    expect(earlyTargeting.pulseProjectionRetention).toBeGreaterThan(0);
    expect(coreTargeting).toMatchObject({
      pulseProjectionRetention: 0.063,
      armyAttackBonus: 0,
      pulseAttackBonus: 0,
      armyDefenseBonus: 0,
      maxIntegrityBonus: 0,
    });
    expect(endlessTargeting.pulseProjectionRetention)
      .toBeGreaterThan(coreTargeting.pulseProjectionRetention);
    expect(endlessTargeting).not.toHaveProperty('treasury');
    expect(endlessTargeting).not.toHaveProperty('annualOutput');
    const branchEffects = {
      pulse: resolveCommanderTalentEffectsV1({
        'science-corps': 15, 'treasury-reserve': 15, 'elite-vanguard': 15,
      }),
      interception: resolveCommanderTalentEffectsV1({
        'volunteer-brigade': 15, 'civil-defense': 15, 'doctrine-command': 15,
      }),
      endurance: resolveCommanderTalentEffectsV1({
        'reserve-cadre': 15, 'drill-instructors': 15, 'frugal-quartermaster': 15,
      }),
      army: resolveCommanderTalentEffectsV1({
        'mobile-logistics': 15, 'combat-recovery': 15, 'theater-network': 15,
      }),
    };
    expect(branchEffects.pulse).toMatchObject({
      pulseAttackBonus: 0.36,
      pulseProjectionRetention: 0.063,
      pulseChargeBonusPerStep: 0.09,
      interceptEfficiencyBonus: 0,
      maxIntegrityBonus: 0,
      armyAttackBonus: 0,
    });
    expect(branchEffects.interception).toMatchObject({
      interceptEfficiencyBonus: 0.09,
      impactRecoveryShare: 0.063,
      defensivePulseBonus: 0.18,
      pulseAttackBonus: 0,
      maxIntegrityBonus: 0,
      armyDefenseBonus: 0,
    });
    expect(branchEffects.endurance).toMatchObject({
      maxIntegrityBonus: 0.36,
      rechargeRateBonus: 0.36,
      rechargeBufferBonus: 0.18,
      pulseAttackBonus: 0,
      interceptEfficiencyBonus: 0,
      armyAttackBonus: 0,
    });
    expect(branchEffects.army).toMatchObject({
      armyAttackBonus: 0.099,
      armyDefenseBonus: 0.072,
      armyPeaceRecoveryBonus: 0.225,
      maxIntegrityBonus: 0,
      pulseAttackBonus: 0,
      interceptEfficiencyBonus: 0,
    });
    expect(Object.values(branchEffects).flatMap(Object.values).every(Number.isFinite)).toBe(true);
  });

  it('continues levels and repeatable talents beyond the authored core with diminishing value', () => {
    expect(COMMANDER_TALENTS_V1.every((talent) => (
      talent.coreRank === COMMANDER_TALENT_CORE_RANK
    ))).toBe(true);
    expect(commanderXpForLevelV1(101)).toBeGreaterThan(commanderXpForLevelV1(100));
    expect(commanderXpForLevelV1(250)).toBeGreaterThan(commanderXpForLevelV1(249));
    expect(commanderLevelFromXpV1(commanderXpForLevelV1(250))).toBe(250);
    expect(Number.isSafeInteger(commanderXpForLevelV1(10_000))).toBe(true);
    expect(commanderLevelFromXpV1(commanderXpForLevelV1(10_000))).toBe(10_000);

    const deepRank = 25;
    const deep = normalizeCommanderProfileV1({
      ...createCommanderProfileV1(50, 'deep-build'),
      commanderXp: commanderXpForLevelV1(250),
      commanderTalents: {
        ...emptyCommanderTalentsV1(),
        'elite-vanguard': deepRank,
        'science-corps': 3,
        'volunteer-brigade': 3,
        'reserve-cadre': 3,
      },
      activeDoctrine: 'vanguard',
      commandCredits: 9_876,
    }, 51);
    expect(deep.commanderLevel).toBe(250);
    expect(deep.commandCredits).toBe(STARTING_COMMAND_CREDITS_V1);
    expect(deep.commanderTalents['elite-vanguard']).toBe(deepRank);
    expect(commanderTalentPointsSpentV1(deep)).toBe(deepRank + 9);
    expect(commanderTalentPointsAvailableV1(deep)).toBe(250 - deepRank - 9);

    const firstDeepGain = commanderTalentNextRankEfficiencyV1(15);
    const laterDeepGain = commanderTalentNextRankEfficiencyV1(100);
    expect(firstDeepGain).toBeGreaterThan(0);
    expect(firstDeepGain).toBeLessThan(1);
    expect(laterDeepGain).toBeGreaterThan(0);
    expect(laterDeepGain).toBeLessThan(firstDeepGain);
    expect(commanderTalentEffectiveRankV1(100)).toBeLessThan(35);
    const coreEffects = resolveCommanderTalentEffectsV1({ 'elite-vanguard': 15 });
    const firstDeepEffects = resolveCommanderTalentEffectsV1({ 'elite-vanguard': 16 });
    const laterDeepEffects = resolveCommanderTalentEffectsV1({ 'elite-vanguard': 100 });
    const nextLaterDeepEffects = resolveCommanderTalentEffectsV1({ 'elite-vanguard': 101 });
    expect(firstDeepEffects.pulseChargeBonusPerStep - coreEffects.pulseChargeBonusPerStep)
      .toBeGreaterThan(0);
    expect(firstDeepEffects.pulseChargeBonusPerStep - coreEffects.pulseChargeBonusPerStep)
      .toBeLessThan(0.01);
    expect(nextLaterDeepEffects.pulseChargeBonusPerStep - laterDeepEffects.pulseChargeBonusPerStep)
      .toBeLessThan(firstDeepEffects.pulseChargeBonusPerStep - coreEffects.pulseChargeBonusPerStep);

    const allocated = allocateCommanderTalentV1(deep, 'elite-vanguard', 52);
    expect(allocated.accepted).toBe(true);
    expect(allocated.profile.commanderTalents['elite-vanguard']).toBe(deepRank + 1);
    expect(commanderTalentPointsAvailableV1(allocated.profile)).toBe(250 - deepRank - 10);

    const respec = respecCommanderTalentsV1(allocated.profile, 53);
    expect(respec.accepted).toBe(true);
    expect(commanderTalentPointsSpentV1(respec.profile)).toBe(0);
    expect(commanderTalentPointsAvailableV1(respec.profile)).toBe(250);
    expect(respec.profile.commanderXp).toBe(deep.commanderXp);
    expect(respec.profile.commanderLevel).toBe(deep.commanderLevel);
    expect(respec.profile.commandCredits).toBe(deep.commandCredits);
    expect(respec.profile.activeDoctrine).toBeNull();
    expect(respecCommanderTalentsV1(respec.profile, 54).accepted).toBe(false);
  });

  it('blocks instant-end farming but settles defeat and End Campaign from identical performance', () => {
    const emptyDefeat = calculateCampaignRewardV1({
      campaignId: 'instant-defeat', countryId: 'bel', mode: 'standard-2026', outcome: 'defeat',
      weeksSurvived: 1, territoriesGained: 0, warsWon: 0, highestSurvivalWave: 0, militaryLosses: 0,
    });
    const common = {
      countryId: 'bel', mode: 'survival' as const,
      weeksSurvived: 52, territoriesGained: 1, warsWon: 0, highestSurvivalWave: 2, militaryLosses: 5,
    };
    const surrender = calculateCampaignRewardV1({
      ...common, campaignId: 'surrender', outcome: 'surrender',
    });
    const defeat = calculateCampaignRewardV1({
      ...common, campaignId: 'defeat', outcome: 'defeat',
    });
    const victory = calculateCampaignRewardV1({
      ...common, campaignId: 'victory', outcome: 'victory',
    });
    expect(emptyDefeat.masteryXp).toBe(0);
    const idleSurrender = calculateCampaignRewardV1({
      campaignId: 'idle-surrender', countryId: 'bel', mode: 'standard-2026', outcome: 'surrender',
      weeksSurvived: 5_200, territoriesGained: 0, warsWon: 0, warsFought: 0,
      highestSurvivalWave: 0, militaryLosses: 0,
    });
    expect(idleSurrender.masteryXp).toBe(0);
    expect(idleSurrender.commanderXp).toBe(0);
    expect(idleSurrender.creditsEarned).toBe(0);
    expect(surrender.masteryXp).toBeGreaterThan(0);
    expect(surrender.creditsEarned).toBe(0);
    expect(surrender).toMatchObject({
      masteryXp: defeat.masteryXp,
      commanderXp: defeat.commanderXp,
      score: defeat.score,
      outcomeMultiplier: 1,
    });
    expect(victory.outcomeMultiplier).toBe(1);
    expect(victory.masteryXp).toBe(surrender.masteryXp);

    const starterOwned = grantStarterCountriesV1(
      createCommanderProfileV1(55, 'end-campaign-exact-once'),
      [STARTER_COUNTRY_ID],
      56,
    ).profile;
    const owned = { ...starterOwned, unlockedCountryIds: [STARTER_COUNTRY_ID, 'bel'] };
    const claimed = claimCampaignRewardV1(owned, surrender, 57);
    expect(claimed.accepted).toBe(true);
    expect(claimed.profile.commandCredits).toBe(STARTING_COMMAND_CREDITS_V1);
    expect(claimed.profile.commanderXp).toBe(surrender.commanderXp);
    expect(claimed.profile.countryMastery.bel?.xp).toBe(surrender.masteryXp);
    expect(claimed.profile.completedCampaigns).toBe(1);
    expect(claimed.profile.surrenders).toBe(1);
    expect(claimed.profile.claimedCampaignIds).toEqual(['surrender']);
    expect(claimed.profile.transactions.filter((entry) => (
      entry.kind === 'campaign-reward' && entry.campaignId === 'surrender'
    ))).toHaveLength(1);

    const duplicate = claimCampaignRewardV1(claimed.profile, surrender, 58);
    expect(duplicate.accepted).toBe(false);
    expect(duplicate.profile).toBe(claimed.profile);
  });

  it('persists a versioned profile and one resumable campaign slot', () => {
    const storage = new MemoryStorage();
    const profile = loadCommanderProfileV1(storage, 100);
    expect(profile.commandCredits).toBe(STARTING_COMMAND_CREDITS_V1);
    expect(profile.activeDoctrine).toBeNull();
    expect(storage.getItem(COMMANDER_PROFILE_STORAGE_KEY)).not.toBeNull();
    expect(resetCommanderProfileV1(storage, 101).activeDoctrine).toBeNull();

    saveCampaignSlotV1(storage, {
      schemaVersion: 1,
      campaignId: 'campaign-1',
      scenario: { mode: 'survival', version: 1, seed: 7 },
      countryId: 'bel',
      defeatedCountryIds: [],
      signalPurgedCountryIds: ['nld'],
      warOutcomes: [],
      warOutcomeLedgerStartedTick: 0,
      profileRevisionAtStart: 4,
      rewardEligible: true,
      loadout: {
        catalogVersion: 1,
        masteryLevel: 3,
        upgrades: { mobilization: 1, logistics: 0, research: 0, economy: 0, trait: 0 },
        openingArmyMultiplier: 1.04,
        openingEconomyMultiplier: 1,
        masteryOpeningArmyMultiplier: 1,
        masteryOpeningEconomyMultiplier: 1,
        traitScale: 0,
        commanderLevel: 175,
        commanderTalents: {
          ...emptyCommanderTalentsV1(),
          'elite-vanguard': 25,
        },
        activeDoctrine: 'vanguard',
        eliteStarterManpower: 0,
        regularStarterManpower: 0,
        trainedReserveStarterManpower: 0,
        openingTreasuryBonus: 0,
        openingFoodWeeksBonus: 0,
      },
      stateSave: '{"save":true}',
      baseline: { startingTerritoryIds: ['bel'], startingMilitaryLosses: 0, startingTick: 0 },
      startedAt: 10,
      updatedAt: 20,
    });
    expect(loadCampaignSlotV1(storage)?.scenario.mode).toBe('survival');
    expect(loadCampaignSlotV1(storage)?.loadout.masteryLevel).toBe(3);
    expect(loadCampaignSlotV1(storage)?.loadout).toMatchObject({
      masteryAllocations: { force: 0, firepower: 0, defense: 0, mobilization: 0 },
      masteryPointsEarned: 2,
      masteryPointsSpent: 0,
      masteryPointsAvailable: 2,
      masteryMilitary: {
        openingArmyMultiplier: 1.005,
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
      },
      openingArmyMultiplier: 1.0452,
      openingEconomyMultiplier: 1,
      masteryOpeningArmyMultiplier: 1.005,
      masteryOpeningEconomyMultiplier: 1,
    });
    expect(loadCampaignSlotV1(storage)?.loadout.commanderLevel).toBe(175);
    expect(loadCampaignSlotV1(storage)?.loadout.commanderTalents['elite-vanguard']).toBe(25);
    expect(loadCampaignSlotV1(storage)?.loadout.activeDoctrine).toBe('vanguard');
    expect(loadCampaignSlotV1(storage)?.signalPurgedCountryIds).toEqual(['nld']);

    const overspentMastery = JSON.parse(
      storage.getItem(CAMPAIGN_SLOT_STORAGE_KEY)!,
    ) as Record<string, any>;
    overspentMastery.loadout.masteryLevel = 150;
    overspentMastery.loadout.masteryAllocations = {
      force: 100,
      firepower: 100,
      defense: 100,
      mobilization: 100,
    };
    storage.setItem(CAMPAIGN_SLOT_STORAGE_KEY, JSON.stringify(overspentMastery));
    expect(loadCampaignSlotV1(storage)?.loadout).toMatchObject({
      masteryLevel: 150,
      masteryAllocations: { force: 100, firepower: 49, defense: 0, mobilization: 0 },
      masteryPointsEarned: 149,
      masteryPointsSpent: 149,
      masteryPointsAvailable: 0,
      masteryMilitary: {
        openingArmyMultiplier: 1.3725,
        armyCapacityMultiplier: 2,
        attackMultiplier: 1.735,
        defenseMultiplier: 1,
        recruitmentMultiplier: 1,
        reserveTrainingMultiplier: 1,
      },
    });

    storage.setItem(CAMPAIGN_SLOT_STORAGE_KEY, JSON.stringify({
      ...overspentMastery,
      loadout: {
        ...overspentMastery.loadout,
        masteryLevel: 3,
      },
    }));

    const legacyWithoutDoctrine = JSON.parse(
      storage.getItem(CAMPAIGN_SLOT_STORAGE_KEY)!,
    ) as Record<string, any>;
    delete legacyWithoutDoctrine.loadout.activeDoctrine;
    delete legacyWithoutDoctrine.signalPurgedCountryIds;
    delete legacyWithoutDoctrine.warOutcomes;
    delete legacyWithoutDoctrine.warOutcomeLedgerStartedTick;
    storage.setItem(CAMPAIGN_SLOT_STORAGE_KEY, JSON.stringify(legacyWithoutDoctrine));
    expect(loadCampaignSlotV1(storage)?.loadout.activeDoctrine).toBeNull();
    expect(loadCampaignSlotV1(storage)?.signalPurgedCountryIds).toEqual([]);
    expect(loadCampaignSlotV1(storage)?.warOutcomes).toEqual([]);
    expect(loadCampaignSlotV1(storage)?.warOutcomeLedgerStartedTick).toBeUndefined();

    legacyWithoutDoctrine.loadout.activeDoctrine = 'vanguard';
    legacyWithoutDoctrine.loadout.commanderTalents['elite-vanguard'] = 0;
    storage.setItem(CAMPAIGN_SLOT_STORAGE_KEY, JSON.stringify(legacyWithoutDoctrine));
    expect(loadCampaignSlotV1(storage)?.loadout.activeDoctrine).toBeNull();

    const forgedAlternative = JSON.parse(storage.getItem(CAMPAIGN_SLOT_STORAGE_KEY)!) as Record<string, any>;
    forgedAlternative.scenario.mode = 'random-world';
    forgedAlternative.rewardEligible = true;
    storage.setItem(CAMPAIGN_SLOT_STORAGE_KEY, JSON.stringify(forgedAlternative));
    expect(loadCampaignSlotV1(storage)?.rewardEligible).toBe(false);
    delete forgedAlternative.rewardEligible;
    storage.setItem(CAMPAIGN_SLOT_STORAGE_KEY, JSON.stringify(forgedAlternative));
    expect(loadCampaignSlotV1(storage)?.rewardEligible).toBe(false);

    clearCampaignSlotV1(storage);
    expect(storage.getItem(CAMPAIGN_SLOT_STORAGE_KEY)).toBeNull();
  });
});
