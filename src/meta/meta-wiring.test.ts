import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import mainSource from '../main.ts?raw';
import worldUiSource from '../ui/WorldUIV2.ts?raw';
import commanderProfileSource from './commanderProfile.ts?raw';

const stylesSource = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('account progression wiring', () => {
  it('applies the immutable Commander and all five country upgrade tracks at campaign start', () => {
    expect(mainSource).toContain('resolveCommanderForceInitializationV1(loadout)');
    expect(mainSource).toContain('nation.empireName = commanderProfile.empireName');
    expect(mainSource).toContain("effects['reinforcement-efficiency'] += levels.mobilization");
    expect(mainSource).toContain("effects['operating-efficiency'] += levels.logistics");
    expect(mainSource).toContain("effects['research-efficiency'] += levels.research");
    expect(mainSource).toContain("effects['tax-efficiency'] += levels.economy");
    expect(commanderProfileSource).toContain('countryTraitScale: loadout.traitScale');
    expect(mainSource).toContain('selectCommanderDoctrineV1(commanderProfile, doctrine)');
    expect(mainSource).toContain('respecCommanderTalentsV1(commanderProfile)');
  });

  it('applies every Survival member mastery before fusion with country traits retired', () => {
    const start = mainSource.indexOf('async function beginStoredCampaign(');
    const end = mainSource.indexOf('function persistProfileResult(', start);
    const launch = mainSource.slice(start, end);
    expect(launch).toContain("const rosterCountryIds = scenario.mode === 'survival'");
    expect(launch).toContain('resolveCountryLoadoutV1(commanderProfile, rosterCountryId)');
    expect(launch.indexOf('applyCountryLoadoutAtCampaignStart('))
      .toBeLessThan(launch.indexOf('engine.formSurvivalEmpire('));
    expect(launch).toContain('resolveCommanderForceInitializationV1(loadout)');
    expect(commanderProfileSource).toContain('BASE_COUNTRY_TRAIT_SCALE_V1 = 0');
    expect(commanderProfileSource).not.toContain('(1 - BASE_COUNTRY_TRAIT_SCALE_V1)');
  });

  it('charges each new Survival seat once, refunds failed starts and never charges resume', () => {
    const charge = mainSource.slice(
      mainSource.indexOf('async function chargeSurvivalDeploymentV1('),
      mainSource.indexOf('function persistCampaignTutorialExperience('),
    );
    const solo = mainSource.slice(
      mainSource.indexOf('async function beginStoredCampaign('),
      mainSource.indexOf('function persistProfileResult('),
    );
    const host = mainSource.slice(
      mainSource.indexOf('async function launchHostGame('),
      mainSource.indexOf('async function launchGuestGame('),
    );
    const guest = mainSource.slice(
      mainSource.indexOf('async function launchGuestGame('),
      mainSource.indexOf('function resumeStoredGuestMatch('),
    );
    const resume = mainSource.slice(
      mainSource.indexOf('function continueStoredCampaign()'),
      mainSource.indexOf('function mountWorldUi('),
    );

    expect(charge).toContain("if (mode !== 'survival') return;");
    expect(charge).toContain('spendSurvivalDeploymentCreditsV1(commanderProfile, deploymentId)');
    expect(charge).toContain('refundSurvivalDeploymentCreditsV1(commanderProfile, deploymentId)');
    expect(charge).toContain('commanderDatabase.saveProfile(commanderProfile)');
    expect(solo).toContain('chargeSurvivalDeploymentV1(scenario.mode, newCampaignId)');
    expect(solo).toContain('await refundSurvivalDeploymentV1(scenario.mode, newCampaignId)');
    expect(solo.indexOf('await commanderDatabase.saveCampaign(newCampaign)'))
      .toBeLessThan(solo.indexOf('campaignSlot = newCampaign'));
    expect(host).toContain('`coop:${launch.transport.roomId}:${launch.transport.hostPeerId}`');
    expect(host).toContain('await refundSurvivalDeploymentV1(scenario.config.mode, deploymentId)');
    expect(host.indexOf('const started = session.start()'))
      .toBeLessThan(host.indexOf('await refundSurvivalDeploymentV1('));
    expect(guest).toContain('`coop:${launch.transport.roomId}:${launch.transport.peerId}`');
    expect(resume).not.toContain('chargeSurvivalDeploymentV1');
  });

  it('does not scale defeated countries across Campaign timelines', () => {
    expect(mainSource).not.toContain('rememberDefeatedCampaignOpponent(');
    expect(mainSource).not.toContain('recordCampaignAdaptationV1(');
    expect(mainSource).not.toContain('applyCampaignWorldEvolutionV1(');
    expect(commanderProfileSource).toContain('Rival scaling was retired.');
  });

  it('settles a real no-territory defeat even if a transient global game-over flag lags', () => {
    expect(mainSource).toContain(
      'engine.territoriesOf(campaignSlot.countryId as PlayerId).length === 0',
    );
  });

  it('uses the explicit resume boundary only when the player continues a stored campaign', () => {
    const start = mainSource.indexOf('function continueStoredCampaign()');
    const end = mainSource.indexOf('function mountWorldUi(', start);
    const continueCampaign = mainSource.slice(start, end);
    expect(continueCampaign).toContain('WorldEngineV2.fromSave(');
    expect(continueCampaign).toContain('engine.resumeClock();');
    expect(continueCampaign).not.toContain('engine.startClock();');

    const storedSettlementStart = mainSource.indexOf('function surrenderStoredCampaign()');
    const storedSettlementEnd = mainSource.indexOf(
      'function applyCountryLoadoutAtCampaignStart(', storedSettlementStart,
    );
    expect(mainSource.slice(storedSettlementStart, storedSettlementEnd))
      .not.toContain('resumeClock');
  });

  it('settles a surrendered home-screen save through the canonical campaign report path', () => {
    const storedSettlementStart = mainSource.indexOf('function surrenderStoredCampaign()');
    const storedSettlementEnd = mainSource.indexOf(
      'function applyCountryLoadoutAtCampaignStart(', storedSettlementStart,
    );
    const storedSettlement = mainSource.slice(storedSettlementStart, storedSettlementEnd);
    const canonicalSettlement = mainSource.slice(
      mainSource.indexOf('async function settleActiveCampaign('),
      storedSettlementStart,
    );
    expect(storedSettlement).toContain('WorldEngineV2.fromSave(campaign.stateSave, resolved.content)');
    expect(storedSettlement).toContain("settleActiveCampaign('surrender', { engine, campaign })");
    expect(canonicalSettlement).toContain('createCampaignLifecycleSnapshotV1({');
    expect(canonicalSettlement).toContain('claimCampaignRewardV1(commanderProfile, snapshot.reward)');
    expect(canonicalSettlement).toContain('campaignReport = new CampaignReportV1({');
    expect(canonicalSettlement).toContain('await commanderDatabase.clearCampaign();');
  });

  it('persists one cumulative war ledger for live, resumed and homescreen settlement', () => {
    const autosave = mainSource.slice(
      mainSource.indexOf('function attachCampaignAutosave('),
      mainSource.indexOf('async function settleActiveCampaign('),
    );
    const settlement = mainSource.slice(
      mainSource.indexOf('async function settleActiveCampaign('),
      mainSource.indexOf('function surrenderStoredCampaign()'),
    );
    const continuation = mainSource.slice(
      mainSource.indexOf('function continueStoredCampaign()'),
      mainSource.indexOf('function mountWorldUi('),
    );
    expect(autosave).toContain('activeCampaign.warOutcomes.filter(');
    expect(autosave).toContain('ownLosses: warOutcome.ownLosses');
    expect(mainSource).toContain('warOutcomeLedgerStartedTick: engine.state.tick');
    expect(continuation).toContain('campaignSlot.warOutcomeLedgerStartedTick === undefined');
    expect(settlement).not.toContain('activeCampaignWarOutcomes');
  });

  it('silently unlocks an ordinary nation on a standard Campaign war victory', () => {
    const autosave = mainSource.slice(
      mainSource.indexOf('function attachCampaignAutosave('),
      mainSource.indexOf('async function settleActiveCampaign('),
    );
    expect(autosave).toContain("activeCampaign?.scenario.mode === 'standard-2026'");
    expect(autosave).toContain("warOutcome.result === 'victory'");
    expect(autosave).toContain('warOutcome?.humanId === activeCampaign.countryId');
    expect(autosave).toContain("engine.content.nations[warOutcome.opponentId]?.kind !== 'rogue-ai'");
    expect(autosave).toContain('recordCampaignDefeatedCountriesV1(');
    expect(autosave).toContain('commanderDatabase.saveProfile(commanderProfile)');
    expect(autosave).not.toContain('recordCampaignSignalPurgedCountriesV1(');
    expect(autosave).not.toContain('enqueueCountryUnlockNotification');
  });

  it('has no unlock popup or nation-purchase runtime wiring', () => {
    for (const source of [mainSource, worldUiSource]) {
      expect(source).not.toMatch(/CountryUnlockNotification|countryUnlockNotificationQueue/);
      expect(source).not.toMatch(/onUnlockCountry|purchaseCountryUpgrade|unlock-notified-country/);
    }
    expect(stylesSource).not.toContain('country-unlock-notice');
  });

  it('contains neither the fullscreen recommendation nor the conquest empire-name modal', () => {
    for (const removed of [
      'fullscreenPromptOpen',
      'renderFullscreenRecommendation',
      'data-action="fullscreen-enter"',
      'empireNameDraft',
      'empireNameSubmitted',
      'renderEmpireNamePrompt',
      'data-action="name-empire"',
    ]) expect(worldUiSource).not.toContain(removed);
    expect(stylesSource).not.toMatch(/fullscreen-recommendation|empire-name-overlay/);
  });
});
