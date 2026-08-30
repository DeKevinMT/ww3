import { describe, expect, it } from 'vitest';
import mainSource from '../main.ts?raw';
import {
  STARTER_COUNTRY_ID,
  acknowledgeCampaignProgressionTutorialV1,
  calculateCampaignRewardV1,
  claimCampaignRewardV1,
  createCommanderProfileV1,
  grantStarterCountriesV1,
  queueCampaignProgressionTutorialV1,
} from './commanderProfile';
import type { GameModeV2 } from '../sim/v2/scenarios';
import {
  loadCommanderProfileV1,
  saveCommanderProfileV1,
  type KeyValueStorage,
} from './commanderStorage';

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function ownedProfile() {
  return grantStarterCountriesV1(
    createCommanderProfileV1(1, 'progression-tutorial'),
    [STARTER_COUNTRY_ID],
    2,
  ).profile;
}

function reward(mode: GameModeV2, campaignId: string) {
  return calculateCampaignRewardV1({
    campaignId,
    countryId: STARTER_COUNTRY_ID,
    mode,
    outcome: 'defeat',
    weeksSurvived: 20,
    territoriesGained: 1,
    territoriesLost: 0,
    warsWon: 0,
    warsFought: 1,
    highestSurvivalWave: mode === 'survival' ? 1 : 0,
    militaryLosses: 0.001,
  });
}

describe('post-Campaign progression tutorial', () => {
  it('wires the settled scenario mode and durable acknowledgement into the account save', () => {
    expect(mainSource).toContain('queueCampaignProgressionTutorialV1(');
    expect(mainSource).toContain('campaign.scenario.mode,');
    expect(mainSource).toContain('claimed.accepted || progressionTutorial.accepted');
    expect(mainSource).toContain('onAcknowledgeCampaignProgressionTutorial: () => persistProfileResult(');
  });

  it('queues after the first completed Campaign and persists one-time dismissal', () => {
    const claimed = claimCampaignRewardV1(
      ownedProfile(),
      reward('standard-2026', 'first-campaign'),
      3,
    );
    expect(claimed.accepted).toBe(true);
    expect(claimed.profile.completedCampaigns).toBe(1);
    expect(claimed.profile.campaignProgressionTutorialState).toBe('locked');

    const queued = queueCampaignProgressionTutorialV1(
      claimed.profile,
      'standard-2026',
      4,
    );
    expect(queued.accepted).toBe(true);
    expect(queued.profile.campaignProgressionTutorialState).toBe('ready');
    expect(queueCampaignProgressionTutorialV1(
      queued.profile,
      'standard-2026',
      5,
    ).accepted).toBe(false);

    const dismissed = acknowledgeCampaignProgressionTutorialV1(queued.profile, 6);
    expect(dismissed.accepted).toBe(true);
    const storage = new MemoryStorage();
    saveCommanderProfileV1(storage, dismissed.profile, 7);
    const reloaded = loadCommanderProfileV1(storage, 8);
    expect(reloaded.campaignProgressionTutorialState).toBe('seen');
    expect(queueCampaignProgressionTutorialV1(
      reloaded,
      'standard-2026',
      9,
    ).accepted).toBe(false);
  });

  it.each(['survival', 'random-world'] as const)(
    'never queues from a %s-only outcome',
    (mode) => {
      const base = ownedProfile();
      const claimed = claimCampaignRewardV1(base, reward(mode, `first-${mode}`), 3);
      const settled = claimed.accepted ? claimed.profile : base;
      const queued = queueCampaignProgressionTutorialV1(settled, mode, 4);
      expect(queued.accepted).toBe(false);
      expect(queued.profile.campaignProgressionTutorialState).toBe('locked');
    },
  );
});
