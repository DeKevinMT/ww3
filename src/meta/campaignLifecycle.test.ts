import { describe, expect, it } from 'vitest';
import {
  loadCampaignSlotV1,
  saveCampaignSlotV1,
  type KeyValueStorage,
  type StoredCampaignV1,
} from './commanderStorage';
import {
  createCampaignLifecycleSnapshotV1,
  resolveCampaignOutcomeV1,
} from './campaignLifecycle';
import type { WarOutcomeV2, WorldStateV2 } from '../sim/v2/types';

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function campaign(overrides: Partial<StoredCampaignV1> = {}): StoredCampaignV1 {
  return {
    schemaVersion: 1,
    campaignId: 'campaign-lifecycle-test',
    scenario: { mode: 'survival', version: 1, seed: 7 },
    countryId: 'bel',
    defeatedCountryIds: [],
    signalPurgedCountryIds: [],
    warOutcomes: [],
    profileRevisionAtStart: 1,
    loadout: {
      catalogVersion: 1,
      masteryLevel: 1,
      upgrades: { mobilization: 0, logistics: 0, research: 0, economy: 0, trait: 0 },
      openingArmyMultiplier: 1,
      openingEconomyMultiplier: 1,
      masteryOpeningArmyMultiplier: 1,
      masteryOpeningEconomyMultiplier: 1,
      traitScale: 0,
      commanderLevel: 1,
      commanderTalents: {
        'elite-vanguard': 0, 'volunteer-brigade': 0, 'reserve-cadre': 0,
        'mobile-logistics': 0, 'frugal-quartermaster': 0, 'science-corps': 0,
        'treasury-reserve': 0, 'civil-defense': 0, 'doctrine-command': 0,
        'drill-instructors': 0,
      },
      activeDoctrine: null,
      eliteStarterManpower: 0,
      regularStarterManpower: 0,
      trainedReserveStarterManpower: 0,
      openingTreasuryBonus: 0,
      openingFoodWeeksBonus: 0,
    },
    rewardEligible: true,
    stateSave: '{}',
    baseline: {
      startingTerritoryIds: ['bel'],
      startingMilitaryLosses: 0,
      startingTick: 0,
    },
    startedAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function state(overrides: Record<string, unknown> = {}): WorldStateV2 {
  return {
    tick: 130,
    players: { bel: {} },
    territories: {
      bel: { owner: 'bel' },
      lux: { owner: 'bel' },
      nld: { owner: 'nld' },
    },
    wars: [],
    events: [],
    polarEndgame: { phase: 'counteroffensive', globalWave: 4 },
    gameOver: false,
    ...overrides,
  } as unknown as WorldStateV2;
}

function outcome(
  warId: string,
  result: WarOutcomeV2['result'],
  ownLosses: number,
  endedTick = 80,
): WarOutcomeV2 {
  return {
    warId,
    result,
    ownLosses,
    humanId: 'bel',
    endedTick,
  } as unknown as WarOutcomeV2;
}

describe('campaign lifecycle settlement', () => {
  it('builds an idempotent exact victory settlement from retained state and the live war ledger', () => {
    const world = state({
      polarEndgame: { phase: 'victory', globalWave: 5 },
      territories: {
        bel: { owner: 'bel' },
        lux: { owner: 'bel' },
        nld: { owner: 'nld' },
        'drake-entry': { owner: 'bel' },
      },
      wars: [{
        id: 'active-war', attackerId: 'bel', defenderId: 'nld',
        attackerLosses: 0.01, defenderLosses: 0.02,
      }],
      events: [{
        id: 91, tick: 120, kind: 'polar', playerId: 'rai',
        message: 'ROGUE WAVE 5: machines advance.',
      }],
    });
    const input = {
      source: world,
      campaign: campaign(),
      warOutcomes: [
        outcome('won-war', 'victory', 0.02),
        outcome('lost-border', 'territorial-loss', 0.03),
        outcome('before-campaign', 'victory', 9, -1),
      ],
    } as const;

    const first = createCampaignLifecycleSnapshotV1(input)!;
    const second = createCampaignLifecycleSnapshotV1(input)!;

    expect(second).toEqual(first);
    expect(first.outcome).toBe('victory');
    expect(first.weeksSurvived).toBe(130);
    expect(first.territoriesGainedIds).toEqual(['drake-entry', 'lux']);
    expect(first.territoryDelta).toBe(2);
    expect(first.warRecord).toEqual({
      wins: 1, losses: 1, complete: true, source: 'war-outcomes',
    });
    expect(first.highestSurvivalWave).toBe(5);
    expect(first.militaryLosses).toBe(0.06);
    expect(first.militaryLossesComplete).toBe(true);
    expect(first.reward.masteryXp).toBeGreaterThan(0);
    expect(first.reward.commanderXp).toBeGreaterThan(0);
    expect(first.reward.antarcticTerritoriesCaptured).toBe(1);
    expect(first.reward).not.toHaveProperty('totalReward');
    expect(first.settlementId).toBe('campaign-lifecycle-test:victory');
  });

  it('slows country mastery for powerful nations without reducing EONSCAR XP', () => {
    const antarcticGain = state({
      tick: 104,
      territories: {
        bel: { owner: 'bel' },
        lux: { owner: 'bel' },
        'drake-entry': { owner: 'bel' },
      },
    });
    const base = createCampaignLifecycleSnapshotV1({
      source: antarcticGain,
      campaign: campaign({ campaignId: 'weak-country-mastery' }),
      outcome: 'surrender',
      countryMasteryXpDifficultyMultiplier: 1,
    })!;
    const superpower = createCampaignLifecycleSnapshotV1({
      source: antarcticGain,
      campaign: campaign({ campaignId: 'superpower-mastery' }),
      outcome: 'surrender',
      countryMasteryXpDifficultyMultiplier: 12,
    })!;

    expect(superpower.reward.masteryXp).toBe(Math.round(base.reward.masteryXp / 12));
    expect(superpower.reward.commanderXp).toBe(base.reward.commanderXp);
  });

  it('keeps auto settlement closed for a live nation and recognizes a terminal defeat', () => {
    const slot = campaign();
    expect(resolveCampaignOutcomeV1(state(), slot)).toBeUndefined();

    const defeated = state({
      players: { nld: {} },
      territories: { bel: { owner: 'nld' } },
      gameOver: true,
      winnerId: 'nld',
      polarEndgame: { phase: 'contact', globalWave: 2 },
    });
    expect(resolveCampaignOutcomeV1(defeated, slot)).toBe('defeat');
    const snapshot = createCampaignLifecycleSnapshotV1({ source: defeated, campaign: slot })!;
    expect(snapshot.outcome).toBe('defeat');
    expect(snapshot.territoriesLostIds).toEqual(['bel']);
    expect(snapshot.warsLost).toBe(1);
  });

  it('exposes only verified post-launch Rogue wave losses to score and rewards', () => {
    const withoutVerifiedKills = createCampaignLifecycleSnapshotV1({
      source: state({
        tick: 52,
        polarEndgame: {
          phase: 'counteroffensive', globalWave: 2,
          rogueWaveLossCreditByPlayer: {},
        },
      }),
      campaign: campaign({ campaignId: 'placeholder-losses' }),
      outcome: 'surrender',
    })!;
    const withVerifiedKills = createCampaignLifecycleSnapshotV1({
      source: state({
        tick: 52,
        polarEndgame: {
          phase: 'counteroffensive', globalWave: 2,
          rogueWaveLossCreditByPlayer: { bel: 0.004 },
        },
      }),
      campaign: campaign({ campaignId: 'verified-wave-losses' }),
      outcome: 'surrender',
    })!;
    expect(withoutVerifiedKills.verifiedRogueWaveLosses).toBe(0);
    expect(withVerifiedKills.verifiedRogueWaveLosses).toBe(0.004);
    expect(withoutVerifiedKills.reward).toMatchObject({
      masteryXp: 0,
      commanderXp: 0,
      creditsEarned: 0,
      score: 0,
    });
    expect(withVerifiedKills.reward.score).toBeGreaterThan(withoutVerifiedKills.reward.score);
    expect(withVerifiedKills.reward.masteryXp).toBeGreaterThan(0);
  });

  it('counts only newly held Antarctic territory for Survival rewards, including the core', () => {
    const oneSector = createCampaignLifecycleSnapshotV1({
      source: state({
        tick: 5_200,
        territories: {
          bel: { owner: 'bel' },
          lux: { owner: 'bel' },
          nld: { owner: 'bel' },
          'drake-entry': { owner: 'bel' },
          'zero-point-core': { owner: 'rai' },
        },
        wars: [{
          id: 'ordinary-world-war', attackerId: 'bel', defenderId: 'rai',
          attackerLosses: 99, defenderLosses: 99,
        }],
        polarEndgame: { phase: 'counteroffensive', globalWave: 99 },
      }),
      campaign: campaign({ campaignId: 'one-antarctic-sector' }),
      outcome: 'surrender',
    })!;
    const withCore = createCampaignLifecycleSnapshotV1({
      source: state({
        tick: 5_200,
        territories: {
          bel: { owner: 'bel' },
          lux: { owner: 'bel' },
          nld: { owner: 'bel' },
          'drake-entry': { owner: 'bel' },
          'zero-point-core': { owner: 'bel' },
        },
        polarEndgame: { phase: 'victory', globalWave: 99 },
      }),
      campaign: campaign({ campaignId: 'antarctic-core-captured' }),
      outcome: 'victory',
    })!;
    const baselineSectorIsNotPaidAgain = createCampaignLifecycleSnapshotV1({
      source: state({
        territories: {
          bel: { owner: 'bel' },
          'drake-entry': { owner: 'bel' },
          'zero-point-core': { owner: 'bel' },
        },
        polarEndgame: { phase: 'victory', globalWave: 99 },
      }),
      campaign: campaign({
        campaignId: 'antarctic-baseline-deduplication',
        baseline: {
          startingTerritoryIds: ['bel', 'drake-entry'],
          startingMilitaryLosses: 0,
          startingTick: 0,
        },
      }),
      outcome: 'victory',
    })!;

    expect(oneSector.territoriesGainedIds).toEqual(['drake-entry', 'lux', 'nld']);
    expect(oneSector.reward.antarcticTerritoriesCaptured).toBe(1);
    expect(withCore.reward.antarcticTerritoriesCaptured).toBe(2);
    expect(baselineSectorIsNotPaidAgain.reward.antarcticTerritoriesCaptured).toBe(1);
    expect(baselineSectorIsNotPaidAgain.territoriesGainedIds).toEqual(['zero-point-core']);
    expect(withCore.reward.masteryXp).toBeGreaterThan(oneSector.reward.masteryXp);
    expect(withCore.reward.commanderXp).toBeGreaterThan(oneSector.reward.commanderXp);
    expect(withCore.reward.score).toBeGreaterThan(oneSector.reward.score);
    expect(withCore.reward.creditsEarned).toBe(0);
  });

  it('requires explicit End Campaign and preserves all performance rewards without a surrender penalty', () => {
    const antarcticGain = state({
      tick: 52,
      territories: { bel: { owner: 'bel' }, 'drake-entry': { owner: 'bel' } },
    });
    const snapshot = createCampaignLifecycleSnapshotV1({
      source: antarcticGain,
      campaign: campaign(),
      outcome: 'surrender',
    })!;
    const defeat = createCampaignLifecycleSnapshotV1({
      source: antarcticGain,
      campaign: campaign({ campaignId: 'matching-defeat' }),
      outcome: 'defeat',
    })!;
    expect(snapshot.outcome).toBe('surrender');
    expect(snapshot.reward.masteryXp).toBeGreaterThan(0);
    expect(snapshot.reward).toMatchObject({
      masteryXp: defeat.reward.masteryXp,
      commanderXp: defeat.reward.commanderXp,
      score: defeat.reward.score,
      outcomeMultiplier: 1,
    });
    expect(snapshot.settlementId).toBe('campaign-lifecycle-test:surrender');
  });

  it('pays nothing for an idle timeline regardless of its age', () => {
    const idleWorld = state({
      tick: 5_200,
      territories: { bel: { owner: 'bel' }, nld: { owner: 'nld' } },
      polarEndgame: { phase: 'contact', globalWave: 0 },
      wars: [],
      events: [],
    });
    const snapshot = createCampaignLifecycleSnapshotV1({
      source: idleWorld,
      campaign: campaign({
        campaignId: 'idle-timeline',
        scenario: { mode: 'standard-2026', version: 1, seed: 7 },
      }),
      outcome: 'surrender',
    })!;

    expect(snapshot.weeksSurvived).toBe(5_200);
    expect(snapshot.warsWon).toBe(0);
    expect(snapshot.warsLost).toBe(0);
    expect(snapshot.reward).toMatchObject({
      masteryXp: 0,
      commanderXp: 0,
    });
  });

  it('keeps multiple completed wars exact through reload and homescreen surrender', () => {
    const storage = new MemoryStorage();
    const retainedWars = [
      {
        warId: 'won-before-reload', endedTick: 40, humanId: 'bel',
        result: 'victory', ownLosses: 0.08,
      },
      {
        warId: 'lost-before-reload', endedTick: 85, humanId: 'bel',
        result: 'territorial-loss', ownLosses: 0.12,
      },
      {
        warId: 'stalemate-before-reload', endedTick: 120, humanId: 'bel',
        result: 'stalemate', ownLosses: 0.04,
      },
    ] as const;
    const active = campaign({
      campaignId: 'reload-ledger',
      scenario: { mode: 'standard-2026', version: 1, seed: 7 },
      warOutcomes: [...retainedWars],
      warOutcomeLedgerStartedTick: 0,
    });
    saveCampaignSlotV1(storage, active);
    const reloaded = loadCampaignSlotV1(storage)!;
    const world = state({
      tick: 156,
      // Model a long-running save whose old event feed has already been pruned.
      events: [],
      polarEndgame: { phase: 'dormant', globalWave: 1 },
    });

    const liveEnd = createCampaignLifecycleSnapshotV1({
      source: world,
      campaign: active,
      outcome: 'surrender',
      warOutcomes: retainedWars,
    })!;
    const homescreenEnd = createCampaignLifecycleSnapshotV1({
      source: world,
      campaign: reloaded,
      outcome: 'surrender',
    })!;

    expect(reloaded.warOutcomes).toEqual(retainedWars);
    expect(homescreenEnd.warRecord).toEqual({
      wins: 1,
      losses: 1,
      complete: true,
      source: 'war-outcomes',
    });
    expect(homescreenEnd.militaryLosses).toBe(0.24);
    expect(homescreenEnd.militaryLossesComplete).toBe(true);
    expect(homescreenEnd.reward.warsFought).toBe(3);
    expect(homescreenEnd.reward).toEqual(liveEnd.reward);
  });

  it('reconstructs only provable results but gives Alternative Universe zero account progression', () => {
    const world = state({
      wars: [{
        id: 'active', attackerId: 'bel', defenderId: 'nld',
        attackerLosses: 0.6, defenderLosses: 0.2,
      }],
      events: [
        { id: 1, tick: 10, kind: 'conquest', playerId: 'bel', message: 'Belgium defeated Luxembourg and conquered its land.' },
        { id: 2, tick: 20, kind: 'conquest', playerId: 'bel', message: 'Belgium defeated Netherlands and conquered its land.' },
      ],
    });
    const slot = campaign({
      scenario: { mode: 'random-world', version: 1, seed: 7 },
      // Even a forged/stale true flag cannot make the sandbox eligible.
      rewardEligible: true,
      baseline: { startingTerritoryIds: ['bel'], startingMilitaryLosses: 0.1, startingTick: 0 },
    });
    const snapshot = createCampaignLifecycleSnapshotV1({
      source: world,
      campaign: slot,
      outcome: 'victory',
    })!;

    expect(snapshot.warRecord).toEqual({
      wins: 2, losses: 0, complete: false, source: 'conquest-events',
    });
    expect(snapshot.militaryLosses).toBe(0.5);
    expect(snapshot.militaryLossesComplete).toBe(false);
    expect(snapshot.mode).toBe('random-world');
    expect(snapshot.rewardEligible).toBe(false);
    expect(snapshot.reward.masteryXp).toBe(0);
    expect(snapshot.reward.commanderXp).toBe(0);
    expect(snapshot.reward).not.toHaveProperty('totalReward');
  });
});
