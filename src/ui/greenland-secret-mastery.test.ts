import { describe, expect, it } from 'vitest';
import {
  GREENLAND_DEEP_MASTERY_MAX_CAPACITY_MULTIPLIER_V1,
  GREENLAND_DEEP_MASTERY_MAX_QUALITY_MULTIPLIER_V1,
  GREENLAND_DEEP_MASTERY_START_LEVEL_V1,
  MAX_COUNTRY_MASTERY_LEVEL,
  buildCountryUnlockCatalogV1,
  countryMasteryXpForLevelV1,
  createCommanderProfileV1,
  normalizeCommanderProfileV1,
  resolveCountryLoadoutV1,
  resolveCountryMasteryMilitaryEffectsV1,
  type CommanderProfileV1,
  type CountryMasteryAllocationsV1,
} from '../meta/commanderProfile';
import {
  loadCampaignSlotV1,
  saveCampaignSlotV1,
  type KeyValueStorage,
  type StoredCampaignV1,
} from '../meta/commanderStorage';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import { resolveScenarioV2 } from '../sim/v2/scenarios';
import { IntroOpeningMetricsCacheV2 } from './WorldUIV2';
import {
  countryMasteredMilitaryPowerV1,
  type CommanderCountryCatalogEntryV1,
} from './CommanderMenu';

const ZERO_ALLOCATIONS: CountryMasteryAllocationsV1 = {
  force: 0,
  firepower: 0,
  defense: 0,
  mobilization: 0,
  'land-logistics': 0,
  expeditionary: 0,
  'military-industry': 0,
  'field-medicine': 0,
};

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function openingCatalog(): readonly CommanderCountryCatalogEntryV1[] {
  const resolved = resolveScenarioV2({ mode: 'standard-2026', seed: 1 });
  const engine = new WorldEngineV2(1, resolved.content);
  const opening = new IntroOpeningMetricsCacheV2().read(engine);
  const nations = resolved.content.nationIds
    .map((id) => resolved.content.nations[id])
    .filter((nation): nation is NonNullable<typeof nation> => (
      nation !== undefined && nation.kind !== 'rogue-ai' && opening.byNation.has(nation.id)
    ));
  const quotes = buildCountryUnlockCatalogV1(nations.map((nation) => ({
    countryId: nation.id,
    strength: opening.byNation.get(nation.id)!.combatPower,
  })));
  return nations.map((nation) => {
    const metrics = opening.byNation.get(nation.id)!;
    return {
      id: nation.id,
      name: nation.name,
      shortName: nation.shortName,
      continent: nation.continent,
      subregion: nation.subregion,
      cssColor: nation.cssColor,
      sigil: nation.sigil,
      militaryPower: metrics.combatPower,
      strategicAccess: [],
      opening: {
        attack: metrics.attack,
        defense: metrics.defense,
        iq: metrics.iq,
        armyManpower: metrics.army.deployed,
        armyCapacity: metrics.army.capacity,
        trainedReserves: 0,
        population: metrics.economyView.population,
        economy: metrics.economyView.output,
        treasury: metrics.player.treasury,
        economicGrowth: metrics.finance.annualEconomyGrowthRate * 100,
        populationGrowth: metrics.populationDynamics.annualNetRate * 100,
        gdpPerCapita: metrics.economyView.wealthPerPerson / 1e6,
      },
      quote: quotes.get(nation.id)!,
    } satisfies CommanderCountryCatalogEntryV1;
  });
}

function greenlandProfile(
  level: number,
  allocations: CountryMasteryAllocationsV1,
): CommanderProfileV1 {
  const base = createCommanderProfileV1(1, `greenland-secret-${level}`);
  return normalizeCommanderProfileV1({
    ...base,
    unlockedCountryIds: ['grl'],
    countryMastery: {
      grl: {
        xp: countryMasteryXpForLevelV1(level),
        level,
        campaigns: 100,
        victories: 50,
        bestSurvivalWave: 0,
        allocations,
      },
    },
  }, 2);
}

describe('Greenland hidden deep-mastery curve', () => {
  it('stays ordinary at the threshold, then becomes visibly unusual around rank twenty', () => {
    const threshold = { ...ZERO_ALLOCATIONS, force: 3, firepower: 3, defense: 3 };
    expect(resolveCountryMasteryMilitaryEffectsV1(
      GREENLAND_DEEP_MASTERY_START_LEVEL_V1,
      threshold,
      'GRL',
    )).toEqual(resolveCountryMasteryMilitaryEffectsV1(
      GREENLAND_DEEP_MASTERY_START_LEVEL_V1,
      threshold,
    ));

    const rankTwenty = { ...ZERO_ALLOCATIONS, force: 7, firepower: 6, defense: 6 };
    const ordinaryTwenty = resolveCountryMasteryMilitaryEffectsV1(20, rankTwenty);
    const greenlandTwenty = resolveCountryMasteryMilitaryEffectsV1(20, rankTwenty, 'grl');
    expect(greenlandTwenty.armyCapacityMultiplier / ordinaryTwenty.armyCapacityMultiplier)
      .toBeGreaterThan(1.06);
    expect(greenlandTwenty.attackMultiplier / ordinaryTwenty.attackMultiplier)
      .toBeGreaterThan(1.04);
    expect(greenlandTwenty.defenseMultiplier / ordinaryTwenty.defenseMultiplier)
      .toBeGreaterThan(1.04);
    expect(greenlandTwenty.armyCapacityMultiplier / ordinaryTwenty.armyCapacityMultiplier)
      .toBeLessThan(1.08);
  });

  it('requires committed points, eases in smoothly, and has a deterministic bounded ceiling', () => {
    const max = { ...ZERO_ALLOCATIONS, force: 50, firepower: 50, defense: 49 };
    const ordinary = resolveCountryMasteryMilitaryEffectsV1(MAX_COUNTRY_MASTERY_LEVEL, max);
    const deep = resolveCountryMasteryMilitaryEffectsV1(
      MAX_COUNTRY_MASTERY_LEVEL,
      max,
      'grl',
    );
    const uncommitted = resolveCountryMasteryMilitaryEffectsV1(
      MAX_COUNTRY_MASTERY_LEVEL,
      ZERO_ALLOCATIONS,
      'grl',
    );
    expect(uncommitted).toEqual(resolveCountryMasteryMilitaryEffectsV1(
      MAX_COUNTRY_MASTERY_LEVEL,
      ZERO_ALLOCATIONS,
    ));
    expect(deep.armyCapacityMultiplier / ordinary.armyCapacityMultiplier)
      .toBeCloseTo(GREENLAND_DEEP_MASTERY_MAX_CAPACITY_MULTIPLIER_V1, 8);
    expect(deep.attackMultiplier / ordinary.attackMultiplier)
      .toBeCloseTo(GREENLAND_DEEP_MASTERY_MAX_QUALITY_MULTIPLIER_V1, 8);
    expect(deep.defenseMultiplier / ordinary.defenseMultiplier)
      .toBeCloseTo(GREENLAND_DEEP_MASTERY_MAX_QUALITY_MULTIPLIER_V1, 8);
    expect(resolveCountryMasteryMilitaryEffectsV1(
      MAX_COUNTRY_MASTERY_LEVEL,
      max,
      'grl',
    )).toEqual(deep);
  });

  it('never gives another nation the hidden modifier', () => {
    const max = { ...ZERO_ALLOCATIONS, force: 50, firepower: 50, defense: 49 };
    const ordinary = resolveCountryMasteryMilitaryEffectsV1(MAX_COUNTRY_MASTERY_LEVEL, max);
    expect(resolveCountryMasteryMilitaryEffectsV1(
      MAX_COUNTRY_MASTERY_LEVEL,
      max,
      'usa',
    )).toEqual(ordinary);
    expect(resolveCountryMasteryMilitaryEffectsV1(
      MAX_COUNTRY_MASTERY_LEVEL,
      max,
      'isl',
    )).toEqual(ordinary);
  });

  it('round-trips the discovered curve through a frozen campaign save', () => {
    const max = greenlandProfile(MAX_COUNTRY_MASTERY_LEVEL, {
      ...ZERO_ALLOCATIONS,
      force: 50,
      firepower: 50,
      defense: 49,
    });
    const loadout = resolveCountryLoadoutV1(max, 'grl');
    const storage = new MemoryStorage();
    const campaign: StoredCampaignV1 = {
      schemaVersion: 1,
      campaignId: 'greenland-deep-mastery-save',
      scenario: { mode: 'standard-2026', version: 1, seed: 7 },
      countryId: 'grl',
      defeatedCountryIds: [],
      signalPurgedCountryIds: [],
      warOutcomes: [],
      profileRevisionAtStart: max.revision,
      loadout,
      rewardEligible: true,
      stateSave: '{"canonical":true}',
      baseline: {
        startingTerritoryIds: ['grl'],
        startingMilitaryLosses: 0,
        startingTick: 0,
      },
      startedAt: 1,
      updatedAt: 2,
    };
    saveCampaignSlotV1(storage, campaign);
    expect(loadCampaignSlotV1(storage)?.loadout.masteryMilitary)
      .toEqual(loadout.masteryMilitary);
  });

  it('keeps Greenland weakest at baseline but makes extreme mastery top-tier', () => {
    const catalog = openingCatalog();
    const greenland = catalog.find((country) => country.id === 'grl')!;
    const usa = catalog.find((country) => country.id === 'usa')!;
    const baseline = greenlandProfile(1, ZERO_ALLOCATIONS);
    const max = greenlandProfile(MAX_COUNTRY_MASTERY_LEVEL, {
      ...ZERO_ALLOCATIONS,
      force: 50,
      firepower: 50,
      defense: 49,
    });

    expect(greenland.quote.strengthRank).toBe(greenland.quote.countryCount);
    expect(countryMasteredMilitaryPowerV1(baseline, greenland))
      .toBeLessThan(countryMasteredMilitaryPowerV1(baseline, usa));
    expect(countryMasteredMilitaryPowerV1(max, greenland))
      .toBeGreaterThan(countryMasteredMilitaryPowerV1(baseline, usa));
    expect(resolveCountryLoadoutV1(max, 'grl').masteryMilitary)
      .toEqual(resolveCountryLoadoutV1(max, 'grl').masteryMilitary);
  });
});
