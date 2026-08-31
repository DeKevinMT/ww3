import { describe, expect, it } from 'vitest';
import {
  createCommanderProgressProjectionV1,
  createCampaignMasteryProjectionV1,
  renderCampaignReportHtmlV1,
} from './CampaignReport';
import type { CampaignLifecycleSnapshotV1 } from '../meta/campaignLifecycle';
import { commanderXpForLevelV1 } from '../meta/commanderProfile';

function reportSnapshot(): CampaignLifecycleSnapshotV1 {
  return {
    schemaVersion: 1,
    settlementId: 'campaign-report:victory',
    campaignId: 'campaign-report',
    countryId: 'zzz',
    mode: 'survival',
    seed: 1,
    outcome: 'victory',
    terminalTick: 160,
    weeksSurvived: 160,
    startingTerritoryIds: ['a'],
    currentTerritoryIds: ['a', 'b', 'c'],
    territoriesGainedIds: ['b', 'c'],
    territoriesLostIds: [],
    territoryDelta: 2,
    warsWon: 3,
    warsLost: 1,
    warRecord: { wins: 3, losses: 1, complete: false, source: 'conquest-events' },
    highestSurvivalWave: 7,
    militaryLosses: 0.042,
    militaryLossesComplete: false,
    rewardEligible: true,
    reward: {
      campaignId: 'campaign-report', countryId: 'zzz', mode: 'survival', outcome: 'victory',
      weeksSurvived: 160, territoriesGained: 2, warsWon: 3,
      highestSurvivalWave: 7, verifiedRogueWaveLosses: 0.25,
      antarcticTerritoriesCaptured: 2, militaryLosses: 0.042,
      modeMultiplier: 1.35,
      outcomeMultiplier: 1.25, masteryXp: 640,
      commanderXp: 480, creditsEarned: 0, score: 2_000,
    },
  };
}

describe('campaign report', () => {
  it('turns commander level-ups into one free talent point each', () => {
    const projection = createCommanderProgressProjectionV1(
      { xp: 0, level: 1, talentPointsAvailable: 2 },
      1_000,
    );
    expect(projection.levelAfter).toBeGreaterThan(projection.levelBefore);
    expect(projection.talentPointsEarned).toBe(projection.levelsGained);
    expect(projection.talentPointsAfter).toBe(2 + projection.levelsGained);
    expect(projection.progress).toBeGreaterThanOrEqual(0);
    expect(projection.progress).toBeLessThanOrEqual(1);

    const level149Xp = commanderXpForLevelV1(149);
    const endlessProjection = createCommanderProgressProjectionV1(
      { xp: level149Xp, level: 149, talentPointsAvailable: 0 },
      commanderXpForLevelV1(150) - level149Xp,
    );
    expect(endlessProjection.levelAfter).toBe(150);
    expect(endlessProjection.talentPointsEarned).toBe(1);
    expect(endlessProjection.xpToNextLevel).toBeGreaterThan(0);
  });

  it('projects country XP across mastery levels without mutating the previous value', () => {
    const mastery = { xp: 170, level: 1 };
    const projection = createCampaignMasteryProjectionV1(mastery, 640);
    expect(mastery).toEqual({ xp: 170, level: 1 });
    expect(projection.xpAfter).toBe(810);
    expect(projection.levelAfter).toBeGreaterThan(projection.levelBefore);
    expect(projection.levelsGained).toBeGreaterThan(0);
    expect(projection.progress).toBeGreaterThanOrEqual(0);
    expect(projection.progress).toBeLessThanOrEqual(1);
  });

  it('renders XP progression, mode-specific Credits and all campaign metrics safely', () => {
    const html = renderCampaignReportHtmlV1({
      snapshot: reportSnapshot(),
      country: { name: '<script>Bad</script>', shortName: 'ZZ', sigil: 'Z', cssColor: '#123abc' },
      masteryBeforeSettlement: { xp: 170, level: 1 },
      commanderBeforeSettlement: { xp: 240, level: 2, talentPointsAvailable: 0 },
    });

    expect(html).toContain('Victory secured.');
    expect(html).toContain('FINAL TIMELINE REPORT · Survival');
    expect(html).toContain('+640 XP');
    expect(html).toContain('APEX LEVEL');
    expect(html).toContain('+480 XP');
    expect(html).toMatch(/TALENT POINT/);
    expect(html).toContain('LIBERATION DELTA');
    expect(html).toContain('2 liberated');
    expect(html).toContain('3–1');
    expect(html).toContain('ROGUE WAVE');
    expect(html).toContain('42K');
    expect(html).toContain('RECORDED RESULTS');
    expect(html).toContain('VERIFIED LOSSES');
    expect(html).toContain('data-campaign-report-action="main-menu"');
    expect(html).toContain('&lt;script&gt;Bad&lt;/script&gt;');
    expect(html).not.toContain('<script>Bad</script>');
    expect(html).toContain('COMMAND CREDITS');
    expect(html).toContain('XP: verified Rogue losses + Antarctic captures only');
    expect(html).toContain('ROGUE LOSSES + ANTARCTIC CAPTURES ONLY');
    expect(html).toContain('Only verified Rogue losses and Antarctic captures became XP.');
    expect(html).not.toMatch(/purchase|price/i);
  });

  it('uses the account empire flag without changing the played nation report', () => {
    const common = {
      snapshot: reportSnapshot(),
      country: { name: 'Greenland', shortName: 'Greenland', sigil: 'GL' },
      masteryBeforeSettlement: { xp: 0, level: 0 },
    };
    const greenlandFlag = renderCampaignReportHtmlV1({ ...common, flagCountryId: 'grl' });
    const japanFlag = renderCampaignReportHtmlV1({ ...common, flagCountryId: 'jpn' });
    expect(japanFlag).not.toBe(greenlandFlag);
    expect(japanFlag).toContain('<strong>Greenland</strong>');
  });

  it('shows earned End Campaign rewards as saved exactly once', () => {
    const snapshot = reportSnapshot();
    snapshot.outcome = 'surrender';
    snapshot.reward.outcome = 'surrender';
    snapshot.reward.outcomeMultiplier = 1;
    snapshot.reward.masteryXp = 75;
    snapshot.reward.commanderXp = 40;
    const html = renderCampaignReportHtmlV1({
      snapshot,
      country: { name: 'Test Republic', sigil: 'TR' },
      masteryBeforeSettlement: { xp: 0, level: 1 },
      commanderBeforeSettlement: { xp: 0, level: 1, talentPointsAvailable: 0 },
    });
    expect(html).toContain('Timeline ended.');
    expect(html).toContain('+75 XP');
    expect(html).toContain('+40 XP');
    expect(html).toContain('APEX · TEMPORAL RETURN');
    expect(html).toContain('This timeline is lost—not our war.');
    expect(html).toContain('Next time, we arrive stronger.');
  });

  it('keeps the same APEX time-return promise inside the defeat report', () => {
    const snapshot = reportSnapshot();
    snapshot.outcome = 'defeat';
    snapshot.reward.outcome = 'defeat';
    const html = renderCampaignReportHtmlV1({
      snapshot,
      country: { name: 'Greenland', sigil: 'GL' },
      masteryBeforeSettlement: { xp: 0, level: 1 },
    });

    expect(html).toContain('Timeline complete.');
    expect(html).toContain('APEX · TEMPORAL RETURN');
    expect(html).toContain('return its lessons to the first free node in Greenland');
    expect(html).not.toContain('TIMELINE INTELLIGENCE SAVED');
  });

  it('shows that Alternative Universe never changes the shared account', () => {
    const snapshot = reportSnapshot();
    snapshot.mode = 'random-world';
    snapshot.rewardEligible = false;
    snapshot.reward = {
      ...snapshot.reward,
      mode: 'random-world',
      masteryXp: 0,
      commanderXp: 0,
      modeMultiplier: 0,
    };
    const html = renderCampaignReportHtmlV1({
      snapshot,
      country: { name: 'Sandbox Nation', sigil: 'SN' },
      masteryBeforeSettlement: { xp: 500, level: 3 },
      commanderBeforeSettlement: { xp: 700, level: 4, talentPointsAvailable: 2 },
    });
    expect(html).toContain('Alternative Universe grants no Nation Mastery XP, APEX XP, Credits or nation unlocks.');
    expect(html).toContain('COMMAND CREDITS');
    expect(html).not.toContain('TIMELINE INTELLIGENCE SAVED');
  });

  it('lists nations unlocked by Campaign war victories', () => {
    const snapshot = reportSnapshot();
    snapshot.mode = 'standard-2026';
    snapshot.reward.mode = 'standard-2026';
    snapshot.reward.creditsEarned = 18;
    const html = renderCampaignReportHtmlV1({
      snapshot,
      country: { name: 'Greenland', sigil: 'GL' },
      masteryBeforeSettlement: { xp: 0, level: 1 },
      unlockedCountries: [
        { countryId: 'isl', name: 'Iceland' },
        { countryId: 'can', name: 'Canada' },
      ],
    });
    expect(html).toContain('CAMPAIGN VICTORY UNLOCKS');
    expect(html).toContain('2 NATIONS ADDED');
    expect(html).toContain('Iceland');
    expect(html).toContain('UNLOCKED · READY IN ALL MODES');
    expect(html).toContain('COMMAND CREDITS');
    expect(html).toContain('+18');
    expect(html).not.toMatch(/price|purchase/i);
  });
});
