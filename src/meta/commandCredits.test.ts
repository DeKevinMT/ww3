import { describe, expect, it } from 'vitest';
import {
  STARTER_COUNTRY_ID,
  STARTING_COMMAND_CREDITS_V1,
  SURVIVAL_DEPLOYMENT_CREDIT_COST_V1,
  calculateCampaignRewardV1,
  claimCampaignRewardV1,
  countryUnlockQuoteV1,
  createCommanderProfileV1,
  normalizeCommanderProfileV1,
  quoteSurvivalDeploymentCreditsV1,
  recordCampaignDefeatedCountriesV1,
  refundSurvivalDeploymentCreditsV1,
  spendSurvivalDeploymentCreditsV1,
  unlockCountryV1,
} from './commanderProfile';
import {
  COMMANDER_PROFILE_STORAGE_KEY,
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
  return normalizeCommanderProfileV1({
    ...createCommanderProfileV1(1, 'credit-test'),
    unlockedCountryIds: [STARTER_COUNTRY_ID],
  }, 2);
}

function survivalFundedProfile(seats = 2) {
  return {
    ...ownedProfile(),
    commandCredits: SURVIVAL_DEPLOYMENT_CREDIT_COST_V1 * seats,
  };
}

function campaignReward(
  campaignId: string,
  outcome: 'victory' | 'defeat' | 'surrender' = 'surrender',
) {
  return calculateCampaignRewardV1({
    campaignId,
    countryId: STARTER_COUNTRY_ID,
    mode: 'standard-2026',
    outcome,
    weeksSurvived: 26,
    territoriesGained: 1,
    territoriesLost: 0,
    warsWon: 1,
    warsFought: 1,
    highestSurvivalWave: 0,
    militaryLosses: 0.01,
  });
}

describe('Command Credits', () => {
  it('starts below the Survival entry fee and safely migrates the retired zero fields', () => {
    const fresh = createCommanderProfileV1(1, 'fresh-credits');
    expect(fresh.commandCredits).toBe(STARTING_COMMAND_CREDITS_V1);
    expect(fresh.lifetimeCreditsEarned).toBe(0);
    expect(quoteSurvivalDeploymentCreditsV1(fresh)).toEqual({
      cost: SURVIVAL_DEPLOYMENT_CREDIT_COST_V1,
      balance: STARTING_COMMAND_CREDITS_V1,
      balanceAfter: 0,
      affordable: false,
    });

    const migrated = normalizeCommanderProfileV1({
      ...fresh,
      commandCredits: 0,
      lifetimeCreditsEarned: 0,
      transactions: [],
    }, 2);
    expect(migrated.commandCredits).toBe(STARTING_COMMAND_CREDITS_V1);
  });

  it('spends one Survival fee exactly once and rejects the next seat when empty', () => {
    const first = spendSurvivalDeploymentCreditsV1(
      survivalFundedProfile(),
      'survival-seat-1',
      3,
    );
    expect(first).toMatchObject({ accepted: true, charged: true });
    expect(first.profile.commandCredits).toBe(SURVIVAL_DEPLOYMENT_CREDIT_COST_V1);
    expect(first.profile.transactions.at(-1)).toMatchObject({
      kind: 'survival-deployment',
      deploymentId: 'survival-seat-1',
      amount: -SURVIVAL_DEPLOYMENT_CREDIT_COST_V1,
      balanceAfter: SURVIVAL_DEPLOYMENT_CREDIT_COST_V1,
    });

    const retry = spendSurvivalDeploymentCreditsV1(first.profile, 'survival-seat-1', 4);
    expect(retry).toMatchObject({ accepted: true, charged: false });
    expect(retry.profile).toBe(first.profile);

    const second = spendSurvivalDeploymentCreditsV1(first.profile, 'survival-seat-2', 5);
    expect(second).toMatchObject({ accepted: true, charged: true });
    expect(second.profile.commandCredits).toBe(0);
    expect(normalizeCommanderProfileV1(structuredClone(second.profile), 6).commandCredits).toBe(0);

    const insufficient = spendSurvivalDeploymentCreditsV1(
      second.profile,
      'survival-seat-3',
      7,
    );
    expect(insufficient).toMatchObject({ accepted: false, charged: false });
    expect(insufficient.reason)
      .toContain(`requires ${SURVIVAL_DEPLOYMENT_CREDIT_COST_V1} Credits; balance 0`);
    expect(insufficient.profile).toBe(second.profile);
  });

  it('refunds a failed downstream launch once and lets the same deployment retry once', () => {
    const opening = survivalFundedProfile(1);
    const charged = spendSurvivalDeploymentCreditsV1(opening, 'failed-launch', 20);
    expect(charged).toMatchObject({ accepted: true, charged: true });
    expect(charged.profile.commandCredits)
      .toBe(opening.commandCredits - SURVIVAL_DEPLOYMENT_CREDIT_COST_V1);

    const rolledBack = refundSurvivalDeploymentCreditsV1(
      charged.profile,
      'failed-launch',
      21,
    );
    expect(rolledBack).toMatchObject({ accepted: true, refunded: true });
    expect(rolledBack.profile.commandCredits).toBe(opening.commandCredits);
    expect(rolledBack.profile.transactions.at(-1)).toMatchObject({
      kind: 'survival-deployment-refund',
      deploymentId: 'failed-launch',
      amount: SURVIVAL_DEPLOYMENT_CREDIT_COST_V1,
      balanceAfter: opening.commandCredits,
    });

    const duplicateRollback = refundSurvivalDeploymentCreditsV1(
      rolledBack.profile,
      'failed-launch',
      22,
    );
    expect(duplicateRollback).toMatchObject({ accepted: true, refunded: false });
    expect(duplicateRollback.profile).toBe(rolledBack.profile);

    const retry = spendSurvivalDeploymentCreditsV1(
      duplicateRollback.profile,
      'failed-launch',
      23,
    );
    expect(retry).toMatchObject({ accepted: true, charged: true });
    expect(retry.profile.commandCredits)
      .toBe(opening.commandCredits - SURVIVAL_DEPLOYMENT_CREDIT_COST_V1);
    const duplicateRetry = spendSurvivalDeploymentCreditsV1(
      retry.profile,
      'failed-launch',
      24,
    );
    expect(duplicateRetry).toMatchObject({ accepted: true, charged: false });
    expect(duplicateRetry.profile).toBe(retry.profile);
  });

  it('keeps nation access entirely victory-based, never credit-purchased', () => {
    const rich = { ...ownedProfile(), commandCredits: 1_000_000 };
    const quote = countryUnlockQuoteV1('bel', 120, 196);
    const purchaseAttempt = unlockCountryV1(rich, quote, 3);
    expect(purchaseAttempt.accepted).toBe(false);
    expect(purchaseAttempt.reason).toContain('Defeat this nation in Campaign');
    expect(purchaseAttempt.profile.commandCredits).toBe(1_000_000);

    const empty = spendSurvivalDeploymentCreditsV1(
      spendSurvivalDeploymentCreditsV1(survivalFundedProfile(), 'seat-a', 4).profile,
      'seat-b',
      5,
    ).profile;
    expect(empty.commandCredits).toBe(0);
    const unlocked = recordCampaignDefeatedCountriesV1(
      empty,
      'bel',
      'standard-2026',
      6,
    );
    expect(unlocked.accepted).toBe(true);
    expect(unlocked.profile.unlockedCountryIds).toContain('bel');
    expect(unlocked.profile.commandCredits).toBe(0);
  });

  it('awards modest Campaign-only Credits for activity without outcome penalties', () => {
    const surrender = campaignReward('credit-surrender', 'surrender');
    const defeat = campaignReward('credit-defeat', 'defeat');
    const victory = campaignReward('credit-victory', 'victory');
    expect(surrender.creditsEarned).toBeGreaterThan(0);
    expect(surrender.creditsEarned).toBeLessThanOrEqual(50);
    expect(defeat.creditsEarned).toBe(surrender.creditsEarned);
    expect(victory.creditsEarned).toBe(surrender.creditsEarned);

    const survival = calculateCampaignRewardV1({
      ...surrender,
      campaignId: 'credit-survival',
      mode: 'survival',
      highestSurvivalWave: 20,
    });
    const alternative = calculateCampaignRewardV1({
      ...surrender,
      campaignId: 'credit-alternative',
      mode: 'random-world',
    });
    expect(survival.creditsEarned).toBe(0);
    expect(alternative.creditsEarned).toBe(0);

    const claimed = claimCampaignRewardV1(ownedProfile(), surrender, 8);
    expect(claimed.accepted).toBe(true);
    expect(claimed.profile.commandCredits)
      .toBe(STARTING_COMMAND_CREDITS_V1 + surrender.creditsEarned);
    expect(claimed.profile.lifetimeCreditsEarned).toBe(surrender.creditsEarned);
    expect(claimed.profile.transactions.at(-1)).toMatchObject({
      kind: 'campaign-reward',
      amount: surrender.creditsEarned,
      balanceAfter: STARTING_COMMAND_CREDITS_V1 + surrender.creditsEarned,
    });
  });

  it('cannot farm Credits by opening and immediately ending a Campaign', () => {
    const idle = calculateCampaignRewardV1({
      campaignId: 'idle-surrender',
      countryId: STARTER_COUNTRY_ID,
      mode: 'standard-2026',
      outcome: 'surrender',
      weeksSurvived: 5_200,
      territoriesGained: 0,
      territoriesLost: 0,
      warsWon: 0,
      warsFought: 0,
      highestSurvivalWave: 0,
      militaryLosses: 0,
    });
    expect(idle.creditsEarned).toBe(0);
    const claimed = claimCampaignRewardV1(ownedProfile(), idle, 9);
    expect(claimed.accepted).toBe(true);
    expect(claimed.profile.commandCredits).toBe(STARTING_COMMAND_CREDITS_V1);
    expect(claimed.profile.lifetimeCreditsEarned).toBe(0);

    const nearZero = calculateCampaignRewardV1({
      ...idle,
      campaignId: 'near-zero-surrender',
      weeksSurvived: 3,
      warsFought: 1,
      militaryLosses: 0.000001,
    });
    expect(nearZero.creditsEarned).toBe(0);
  });

  it('round-trips balances and the exact-once spend ledger through account storage', () => {
    const storage = new MemoryStorage();
    const spent = spendSurvivalDeploymentCreditsV1(
      survivalFundedProfile(),
      'saved-survival-seat',
      10,
    );
    const saved = saveCommanderProfileV1(storage, spent.profile, 11);
    const loaded = loadCommanderProfileV1(storage, 12);
    expect(storage.getItem(COMMANDER_PROFILE_STORAGE_KEY)).not.toBeNull();
    expect(loaded.commandCredits).toBe(saved.commandCredits);
    expect(loaded.lifetimeCreditsEarned).toBe(saved.lifetimeCreditsEarned);
    expect(loaded.transactions).toContainEqual(expect.objectContaining({
      kind: 'survival-deployment',
      deploymentId: 'saved-survival-seat',
    }));
    const retry = spendSurvivalDeploymentCreditsV1(loaded, 'saved-survival-seat', 13);
    expect(retry).toMatchObject({ accepted: true, charged: false });
    expect(retry.profile.commandCredits).toBe(SURVIVAL_DEPLOYMENT_CREDIT_COST_V1);
  });
});
