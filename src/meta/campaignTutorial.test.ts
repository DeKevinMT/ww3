import { describe, expect, it } from 'vitest';
import { AI_FIRST_WAR_TICK } from '../sim/v2/balance';
import { processOpeningConflictsV2 } from '../sim/v2/bootstrap';
import {
  campaignAiVsAiWarOpeningTickV2,
  campaignHumanWarsUnlockedV2,
} from '../sim/v2/campaignPrologue';
import { processCampaignFirstStrikeGuidanceV2 } from '../sim/v2/campaignFirstStrike';
import {
  CAMPAIGN_TUTORIAL_PROJECT_ID_V2,
  campaignTutorialBypassedV2,
  initializeExperiencedCampaignV2,
} from '../sim/v2/campaignTutorial';
import { processApexNarrativeV2 } from '../sim/v2/apexNarrative';
import { WorldEngineV2 } from '../sim/v2/WorldEngineV2';
import {
  createCommanderProfileV1,
  grantStarterCountriesV1,
  normalizeCommanderProfileV1,
  recordCampaignTutorialExperiencedV1,
  resolveCountryLoadoutV1,
  STARTER_COUNTRY_ID,
} from './commanderProfile';
import {
  loadCommanderProfileV1,
  saveCommanderProfileV1,
  storedCampaignWasPlayedV1,
  type KeyValueStorage,
  type StoredCampaignV1,
} from './commanderStorage';

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function campaignSlot(engine: WorldEngineV2): StoredCampaignV1 {
  const countryId = engine.state.humanPlayerId;
  const profile = grantStarterCountriesV1(
    createCommanderProfileV1(1, 'tutorial-storage'),
    [STARTER_COUNTRY_ID],
    2,
  ).profile;
  return {
    schemaVersion: 1,
    campaignId: 'tutorial-campaign',
    scenario: { mode: 'standard-2026', version: 1, seed: engine.state.seed },
    countryId,
    defeatedCountryIds: [],
    signalPurgedCountryIds: [],
    warOutcomes: [],
    profileRevisionAtStart: profile.revision,
    loadout: resolveCountryLoadoutV1(profile, STARTER_COUNTRY_ID),
    rewardEligible: true,
    stateSave: engine.save(),
    baseline: {
      startingTerritoryIds: engine.territoriesOf(countryId).map((territory) => territory.id),
      startingMilitaryLosses: 0,
      startingTick: 0,
    },
    startedAt: 10,
    updatedAt: 10,
  };
}

describe('retired Campaign opening tutorial compatibility', () => {
  it('starts a brand-new profile without tutorial messages or an attack lock', () => {
    const fresh = createCommanderProfileV1(1, 'first-campaign');
    expect(fresh.campaignTutorialCompleted).toBe(false);

    const first = new WorldEngineV2(101);
    const playerId = first.state.humanPlayerId;
    first.state.tick = 6;
    expect(campaignTutorialBypassedV2(first.state, first.content, playerId)).toBe(true);
    expect(campaignHumanWarsUnlockedV2(first.state, first.content, playerId)).toBe(true);
    expect(campaignAiVsAiWarOpeningTickV2(first.state, first.content))
      .toBe(AI_FIRST_WAR_TICK);
    expect(processOpeningConflictsV2(first.state, first.content)).toBe(false);
    expect(processApexNarrativeV2(first.state, first.content)).toBe(0);
    expect(first.apexTransmissions(playerId)).toEqual([]);

    // The durable marker remains readable/writable for existing account data,
    // even though it no longer gates the opening experience.
    const recorded = recordCampaignTutorialExperiencedV1(fresh, 2);
    expect(recorded.accepted).toBe(true);
    expect(recorded.profile.campaignTutorialCompleted).toBe(true);
    expect(recordCampaignTutorialExperiencedV1(recorded.profile, 3).accepted).toBe(false);

    const storage = new MemoryStorage();
    saveCommanderProfileV1(storage, recorded.profile, 4);
    expect(loadCommanderProfileV1(storage, 5).campaignTutorialCompleted).toBe(true);
  });

  it('initializes every Campaign with Stage I complete and no tutorial queue', () => {
    const engine = new WorldEngineV2(202);
    const playerId = engine.state.humanPlayerId;
    expect(initializeExperiencedCampaignV2(engine.state, engine.content, playerId)).toBe(true);
    expect(campaignTutorialBypassedV2(engine.state, engine.content, playerId)).toBe(true);
    expect(engine.state.polarEndgame.arcticPrograms[playerId]).toMatchObject({
      activeProject: null,
      completedProjects: [CAMPAIGN_TUTORIAL_PROJECT_ID_V2],
    });
    expect(engine.state.polarEndgame.communicationsBlackoutTick).toBe(0);
    expect(campaignHumanWarsUnlockedV2(engine.state, engine.content, playerId)).toBe(true);
    expect(campaignAiVsAiWarOpeningTickV2(engine.state, engine.content))
      .toBe(AI_FIRST_WAR_TICK);

    engine.state.tick = 100;
    expect(processOpeningConflictsV2(engine.state, engine.content)).toBe(false);
    expect(processCampaignFirstStrikeGuidanceV2(engine.state, engine.content)).toBe(0);
    expect(processApexNarrativeV2(engine.state, engine.content)).toBe(0);
    expect(engine.apexTransmissions(playerId)).toEqual([]);

    // Genuine later Rogue-world milestones remain eligible without recreating
    // any introductory dependency in the inbox.
    engine.state.polarEndgame.rogueAttention.stage = 'observing';
    expect(processApexNarrativeV2(engine.state, engine.content)).toBe(1);
    expect(engine.apexTransmissions(playerId).map((item) => item.id))
      .toEqual(['campaign-attention-observing']);
  });

  it('migrates only accounts and active saves with durable play evidence', () => {
    const current = createCommanderProfileV1(10, 'legacy-profile');
    const { campaignTutorialCompleted: _newField, ...legacyFresh } = current;
    expect(normalizeCommanderProfileV1(legacyFresh, 11).campaignTutorialCompleted).toBe(false);
    expect(normalizeCommanderProfileV1({
      ...legacyFresh,
      completedCampaigns: 1,
    }, 11).campaignTutorialCompleted).toBe(true);
    expect(normalizeCommanderProfileV1({
      ...current,
      campaignTutorialCompleted: false,
      completedCampaigns: 1,
    }, 11).campaignTutorialCompleted).toBe(false);

    const pristineEngine = new WorldEngineV2(303);
    const pristineSlot = campaignSlot(pristineEngine);
    expect(storedCampaignWasPlayedV1(pristineSlot)).toBe(false);
    pristineEngine.step();
    const playedSlot = { ...pristineSlot, stateSave: pristineEngine.save(), updatedAt: 11 };
    expect(storedCampaignWasPlayedV1(playedSlot)).toBe(true);
  });

  it('keeps the compatibility marker and tutorial-free opener across save/reconnect', () => {
    const engine = new WorldEngineV2(404);
    const playerId = engine.state.humanPlayerId;
    initializeExperiencedCampaignV2(engine.state, engine.content, playerId);

    const loaded = WorldEngineV2.fromSave(engine.save(), engine.content);
    expect(campaignTutorialBypassedV2(loaded.state, loaded.content, playerId)).toBe(true);
    expect(loaded.state.polarEndgame.arcticPrograms[playerId]?.completedProjects)
      .toContain(CAMPAIGN_TUTORIAL_PROJECT_ID_V2);
    loaded.state.tick = 100;
    expect(processApexNarrativeV2(loaded.state, loaded.content)).toBe(0);
    expect(loaded.apexTransmissions(playerId)).toEqual([]);
    expect(processCampaignFirstStrikeGuidanceV2(loaded.state, loaded.content)).toBe(0);
  });
});
