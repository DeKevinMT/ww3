import './styles.css';
import { validateMap } from './game/data/worldMap';
import { createWorldMapRenderer } from './game/map/createWorldMapRenderer';
import { CommanderDatabaseV1 } from './meta/commanderDatabase';
import {
  acknowledgeCampaignProgressionTutorialV1,
  allocateCountryMasteryPointV1,
  allocateCommanderTalentV1,
  buildCountryUnlockCatalogV1,
  claimCampaignRewardV1,
  commanderTalentPointsAvailableV1,
  countryMasteryV1,
  countryMasteryXpDifficultyMultiplierV1,
  createCommanderProfileV1,
  grantStarterCountriesV1,
  queueCampaignProgressionTutorialV1,
  renameCommanderV1,
  renameEmpireV1,
  selectEmpireFlagV1,
  respecCountryMasteryV1,
  respecCommanderTalentsV1,
  recordCampaignDefeatedCountriesV1,
  recordCampaignTutorialExperiencedV1,
  refundSurvivalDeploymentCreditsV1,
  resolveCommanderForceInitializationV1,
  resolveCountryLoadoutV1,
  selectCommanderDoctrineV1,
  spendSurvivalDeploymentCreditsV1,
  type CommanderProfileV1,
  type CountryMasteryTrackV1,
  type ResolvedCountryLoadoutV1,
} from './meta/commanderProfile';
import { createCampaignLifecycleSnapshotV1 } from './meta/campaignLifecycle';
import { campaignCountrySignalPurgeCompleteV1 } from './meta/countryUnlockEligibility';
import {
  saveCampaignSlotV1,
  storedCampaignWasPlayedV1,
  type StoredCampaignV1,
} from './meta/commanderStorage';
import { GuestGameSession, HostGameSession, type GameSessionEngineV2 } from './multiplayer/gameSession';
import {
  applyMultiplayerDeploymentsV1,
  createMultiplayerDeploymentSnapshotV1,
  registerMultiplayerDeploymentRuntimeV1,
} from './multiplayer/deployment';
import {
  GuestReconnectCoordinator,
  HostReconnectCoordinator,
  type GuestReconnectTransportIdentity,
} from './multiplayer/reconnect';
import {
  clearGuestReconnectSessionV1,
  loadGuestReconnectSessionV1,
  refreshGuestReconnectSessionV1,
  type StoredGuestReconnectSessionV1,
} from './multiplayer/reconnectStorage';
import {
  localCountryFromLobby,
  multiplayerControllerNamesFromLobby,
  multiplayerDeploymentsFromLobby,
  multiplayerSeatsFromLobby,
} from './multiplayer/orchestration';
import type { PlayerId } from './sim/v2/types';
import { WorldEngineV2 } from './sim/v2/WorldEngineV2';
import { synchronizeArmyCapacityV2 } from './sim/v2/capacity';
import {
  registerCountryMasteryRuntimeV2,
  resetCountryMasteryRuntimeV2,
} from './sim/v2/countryMasteryRuntime';
import {
  CAMPAIGN_TUTORIAL_PROJECT_ID_V2,
  initializeExperiencedCampaignV2,
} from './sim/v2/campaignTutorial';
import { acknowledgePolarWarningV2 } from './sim/v2/polarEndgame';
import { V2_RULES_VERSION } from './sim/v2/balance';
import {
  normalizeScenarioConfigV2,
  resolveScenarioV2,
  scenarioConfigFromEngineV2,
  type GameModeV2,
  type ScenarioConfigV2,
} from './sim/v2/scenarios';
import {
  MultiplayerLobby,
  type MultiplayerGuestLaunch,
  type MultiplayerHostLaunch,
} from './ui/MultiplayerLobby';
import { MultiplayerSessionStatus } from './ui/MultiplayerSessionStatus';
import {
  CommanderMenuV1,
  type CommanderCountryCatalogEntryV1,
} from './ui/CommanderMenu';
import { CampaignReportV1 } from './ui/CampaignReport';
import {
  loadingTipAudienceForModeV1,
  selectLoadingTipV1,
  type LoadingTipAudience,
} from './ui/loadingTips';
import { IntroOpeningMetricsCacheV2, WorldUIV2 } from './ui/WorldUIV2';
import './ui/ApexReclamationTheme.css';

const mapErrors = validateMap();
if (mapErrors.length > 0) throw new Error(`Invalid map:\n${mapErrors.join('\n')}`);

function randomSeed(): number {
  const randomSeed = new Uint32Array(1);
  window.crypto.getRandomValues(randomSeed);
  return randomSeed[0] || 1;
}

function initialScenarioFromLocation(): ScenarioConfigV2 {
  const parameters = new URLSearchParams(window.location.search);
  const requestedSeed = Number(parameters.get('seed'));
  const requestedModeParameter = parameters.get('mode');
  const requestedMode: GameModeV2 = requestedModeParameter === 'alternative-universe'
      || requestedModeParameter === 'random-world'
    ? 'random-world'
    : requestedModeParameter === 'survival' ? 'survival' : 'standard-2026';
  return normalizeScenarioConfigV2({
    mode: requestedMode,
    seed: Number.isInteger(requestedSeed) && requestedSeed > 0
      ? requestedSeed
      : randomSeed(),
  });
}

function publishScenarioToLocation(scenario: ScenarioConfigV2): void {
  const url = new URL(window.location.href);
  url.searchParams.set('seed', String(scenario.seed));
  if (scenario.mode === 'random-world') url.searchParams.set('mode', 'alternative-universe');
  else if (scenario.mode === 'survival') url.searchParams.set('mode', 'survival');
  else url.searchParams.delete('mode');
  window.history.replaceState(null, '', url);
}

function sameScenario(left: ScenarioConfigV2, right: ScenarioConfigV2): boolean {
  return left.mode === right.mode && left.version === right.version && left.seed === right.seed;
}

function buildCommanderCountryCatalog(): readonly CommanderCountryCatalogEntryV1[] {
  const resolved = resolveScenarioV2({ mode: 'standard-2026', seed: 1 });
  const engine = new WorldEngineV2(1, resolved.content);
  const opening = new IntroOpeningMetricsCacheV2().read(engine);
  const humanNations = resolved.content.nationIds
    .map((id) => resolved.content.nations[id])
    .filter((nation): nation is NonNullable<typeof nation> => (
      nation !== undefined && nation.kind !== 'rogue-ai' && opening.byNation.has(nation.id)
    ));
  const quotes = buildCountryUnlockCatalogV1(humanNations.map((nation) => ({
    countryId: nation.id,
    strength: opening.byNation.get(nation.id)?.combatPower ?? 0,
  })));
  const humanNationIds = new Set(humanNations.map((nation) => nation.id));
  const strategicAccessByNation = new Map<string, Map<string, 'land' | 'naval'>>();
  for (const territoryId of resolved.content.territoryIds) {
    const territory = resolved.content.territories[territoryId];
    if (!territory || !humanNationIds.has(territory.initialOwnerId)) continue;
    const routes = strategicAccessByNation.get(territory.initialOwnerId) ?? new Map();
    for (const connection of territory.connections) {
      const targetOwnerId = resolved.content.territories[connection.targetId]?.initialOwnerId;
      if (!targetOwnerId || targetOwnerId === territory.initialOwnerId
        || !humanNationIds.has(targetOwnerId)) continue;
      const access = connection.kind === 'land' ? 'land' : 'naval';
      if (!routes.has(targetOwnerId) || (routes.get(targetOwnerId) === 'naval' && access === 'land')) {
        routes.set(targetOwnerId, access);
      }
    }
    strategicAccessByNation.set(territory.initialOwnerId, routes);
  }
  return humanNations.map((nation) => {
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
      strategicAccess: [...(strategicAccessByNation.get(nation.id) ?? new Map())]
        .map(([countryId, kind]) => ({ countryId, kind }))
        .sort((left, right) => left.countryId.localeCompare(right.countryId)),
      opening: {
        attack: metrics.attack,
        defense: metrics.defense,
        iq: metrics.iq,
        armyManpower: metrics.army.deployed,
        armyCapacity: metrics.army.capacity,
        trainedReserves: metrics.player.trainedReserves,
        population: metrics.economyView.population,
        economy: metrics.economyView.output,
        treasury: metrics.player.treasury,
        economicGrowth: metrics.finance.annualEconomyGrowthRate * 100,
        populationGrowth: metrics.populationDynamics.annualNetRate * 100,
        gdpPerCapita: metrics.economyView.wealthPerPerson / 1e6,
      },
      quote: quotes.get(nation.id)!,
    };
  }).sort((left, right) => left.quote.strengthRank - right.quote.strengthRank);
}

let activeEngine: WorldEngineV2 | undefined;
let activeUi: WorldUIV2 | undefined;
let activeLobby: MultiplayerLobby | undefined;
let activeSession: HostGameSession | GuestGameSession | undefined;
let activeSessionStatus: MultiplayerSessionStatus | undefined;
let activeHostReconnect: HostReconnectCoordinator | undefined;
let activeGuestReconnect: GuestReconnectCoordinator | undefined;
let activeGuestReconnectSession: StoredGuestReconnectSessionV1 | undefined;
let lastGuestReconnectRefreshAt = 0;
let pageUnloading = false;
let unsubscribeSessionStatus: (() => void) | undefined;
let unsubscribeCampaignAutosave: (() => void) | undefined;
let campaignAutosaveTimer: number | undefined;
let activeControllerNames: ReadonlyMap<PlayerId, string> = new Map();
let activeEmpireFlagCountryIds: ReadonlyMap<PlayerId, string> = new Map();
let activeScenario = initialScenarioFromLocation();
let commanderMenu: CommanderMenuV1 | undefined;
let campaignReport: CampaignReportV1 | undefined;
let commanderProfile: CommanderProfileV1;
let campaignSlot: StoredCampaignV1 | undefined;
let commanderCountryCatalog: readonly CommanderCountryCatalogEntryV1[] = [];
let campaignSettlementInProgress = false;

const commanderDatabase = new CommanderDatabaseV1(window.localStorage);

const startupLoader = document.querySelector<HTMLElement>('#startup-loader');
const gameVersionBadge = document.createElement('aside');
const compactGameVersion = V2_RULES_VERSION.match(/v\d+(?:\.\d+)*/i)?.[0] ?? V2_RULES_VERSION;
gameVersionBadge.className = 'game-version-badge';
gameVersionBadge.textContent = compactGameVersion.toUpperCase();
gameVersionBadge.setAttribute('aria-label', 'APEX: Reclamation ' + compactGameVersion);
document.body.append(gameVersionBadge);
const worldMapRenderer = createWorldMapRenderer();
let startupLoaderState: 'idle' | 'active' | 'complete' = startupLoader?.isConnected
  ? 'active' : 'idle';
let startupLoaderFallbackTimer: number | undefined;
let startupLoaderShownAt = performance.now();
const BOOT_LOADER_MIN_VISIBLE_MS = 450;
const STARTUP_LOADER_MIN_VISIBLE_MS = 2_800;
const LAST_LOADING_TIP_STORAGE_KEY = 'frontier-command:last-loading-tip:v1';
let currentLoadingTipId: string | undefined;

try {
  currentLoadingTipId = window.sessionStorage.getItem(LAST_LOADING_TIP_STORAGE_KEY) ?? undefined;
} catch {
  // Private browsing can deny storage while the game itself remains playable.
}

function showFreshLoadingTip(audience: LoadingTipAudience): void {
  const target = startupLoader?.querySelector<HTMLElement>('[data-loader-tip]');
  if (!target) return;
  const tip = selectLoadingTipV1(audience, currentLoadingTipId);
  target.textContent = tip.text;
  currentLoadingTipId = tip.id;
  try {
    window.sessionStorage.setItem(LAST_LOADING_TIP_STORAGE_KEY, tip.id);
  } catch {
    // A fresh in-memory tip is enough when session storage is unavailable.
  }
}

showFreshLoadingTip('boot');

if (startupLoaderState === 'active') {
  startupLoaderFallbackTimer = window.setTimeout(dismissStartupLoader, 12_000);
}

function showStartupLoader(): void {
  if (startupLoaderState !== 'idle' || !startupLoader?.isConnected) return;
  startupLoaderState = 'active';
  startupLoaderShownAt = performance.now();
  startupLoader.classList.remove('is-hidden', 'is-ready');
  startupLoader.setAttribute('aria-hidden', 'false');
  // A failed renderer must never leave the confirmed game permanently covered.
  startupLoaderFallbackTimer = window.setTimeout(dismissStartupLoader, 12_000);
}

function showDeploymentLoader(countryId: PlayerId, scenario: ScenarioConfigV2): void {
  if (!startupLoader?.isConnected) return;
  const beginsNewLoadingCycle = startupLoaderState === 'idle';
  const country = commanderCountryCatalog.find((entry) => entry.id === countryId);
  const mode = scenario.mode === 'standard-2026' ? 'Campaign'
    : scenario.mode === 'survival' ? 'Survival' : 'Alternative Universe';
  startupLoader.dataset.loaderVariant = 'deployment';
  startupLoader.dataset.loaderStage = 'world';
  const accessible = startupLoader.querySelector<HTMLElement>('.startup-loader__sr-only');
  if (accessible) accessible.textContent = `Deploying ${country?.name ?? countryId.toUpperCase()} into ${mode}`;
  // Keep one tip stable for the entire loading cycle. Redundant safety calls may
  // advance the stage, but must never visibly swap the player's current tip.
  if (beginsNewLoadingCycle) {
    showFreshLoadingTip(loadingTipAudienceForModeV1(scenario.mode));
  }
  showStartupLoader();
}

function setDeploymentLoaderStage(stage: 'map' | 'apex'): void {
  if (startupLoader?.dataset.loaderVariant === 'deployment') {
    startupLoader.dataset.loaderStage = stage;
  }
}

function dismissStartupLoader(): void {
  if (startupLoaderState !== 'active' || !startupLoader?.isConnected) return;
  startupLoaderState = 'complete';
  if (startupLoaderFallbackTimer !== undefined) {
    window.clearTimeout(startupLoaderFallbackTimer);
    startupLoaderFallbackTimer = undefined;
  }
  startupLoader.classList.add('is-ready');
  startupLoader.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => {
    if (!startupLoader.isConnected) return;
    startupLoader.classList.add('is-hidden');
    startupLoader.classList.remove('is-ready');
    startupLoaderState = 'idle';
  }, 260);
}

async function dismissStartupLoaderAfterMapFrame(): Promise<void> {
  if (startupLoaderState !== 'active') return;
  try {
    setDeploymentLoaderStage('map');
    const renderer = await worldMapRenderer;
    // The political sync initially paints the base immediately, while SVG
    // flags settle asynchronously into one batched atlas redraw. Do not expose
    // that intermediate map underneath the loader.
    await renderer.waitForMapReady();
    if (startupLoaderState !== 'active') return;
    setDeploymentLoaderStage('apex');
    // Keep the cover up long enough for the opening camera flight and label
    // collision pass to settle, then request a fresh final frame. This avoids
    // revealing a globe that still visibly recentres itself.
    const minimumDelayRemaining = Math.max(
      0,
      STARTUP_LOADER_MIN_VISIBLE_MS - (performance.now() - startupLoaderShownAt),
    );
    if (minimumDelayRemaining > 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, minimumDelayRemaining));
    }
    if (startupLoaderState !== 'active') return;
    // The subsequent WebGL frame uploads and draws the completed atlas at its
    // settled camera position.
    await renderer.waitForNextFrame();
    // Let the browser present that framebuffer before fading the cover away.
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  } finally {
    dismissStartupLoader();
  }
}

async function focusInitialFlagshipAfterMapReady(countryId: PlayerId): Promise<void> {
  const renderer = await worldMapRenderer;
  await renderer.waitForMapReady();
  renderer.focusCountry(countryId);
}

async function dismissBootLoaderAfterReady(): Promise<void> {
  if (startupLoaderState !== 'active') return;
  try {
    const remaining = Math.max(
      0,
      BOOT_LOADER_MIN_VISIBLE_MS - (performance.now() - startupLoaderShownAt),
    );
    if (remaining > 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, remaining));
    }
    if (startupLoaderState !== 'active') return;
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  } finally {
    dismissStartupLoader();
  }
}

function worldEngineFromSession(engine: GameSessionEngineV2): WorldEngineV2 {
  if (!(engine instanceof WorldEngineV2)) throw new Error('The multiplayer snapshot did not create a WorldEngineV2 replica.');
  return engine;
}

function destroyActiveGame(closeSession = true): void {
  const closingGuestMatch = activeSession instanceof GuestGameSession;
  if (campaignAutosaveTimer !== undefined) {
    window.clearTimeout(campaignAutosaveTimer);
    campaignAutosaveTimer = undefined;
  }
  unsubscribeCampaignAutosave?.();
  unsubscribeCampaignAutosave = undefined;
  unsubscribeSessionStatus?.();
  unsubscribeSessionStatus = undefined;
  activeSessionStatus?.destroy();
  activeSessionStatus = undefined;
  activeHostReconnect?.destroy();
  activeHostReconnect = undefined;
  activeGuestReconnect?.destroy();
  activeGuestReconnect = undefined;
  activeUi?.destroy();
  activeUi = undefined;
  activeEngine?.stopClock();
  activeEngine = undefined;
  const session = activeSession;
  activeSession = undefined;
  session?.close(closeSession);
  if (closingGuestMatch && !pageUnloading) {
    clearGuestReconnectSessionV1(window.sessionStorage);
    activeGuestReconnectSession = undefined;
  }
  activeControllerNames = new Map();
  activeEmpireFlagCountryIds = new Map();
}

function refreshActiveGuestReconnectSession(force = false): void {
  if (!activeGuestReconnectSession) return;
  const now = Date.now();
  if (!force && now - lastGuestReconnectRefreshAt < 15_000) return;
  activeGuestReconnectSession = refreshGuestReconnectSessionV1(
    window.sessionStorage,
    activeGuestReconnectSession,
    now,
  );
  lastGuestReconnectRefreshAt = now;
}

function clearActiveGuestReconnectSession(): void {
  clearGuestReconnectSessionV1(window.sessionStorage);
  activeGuestReconnectSession = undefined;
  lastGuestReconnectRefreshAt = 0;
}

function campaignId(): string {
  return `campaign-${Date.now().toString(36)}-${randomSeed().toString(36)}`;
}

async function chargeSurvivalDeploymentV1(
  mode: GameModeV2,
  deploymentId: string,
): Promise<void> {
  if (mode !== 'survival') return;
  const spent = spendSurvivalDeploymentCreditsV1(commanderProfile, deploymentId);
  if (!spent.accepted) {
    throw new Error(spent.reason ?? 'This account cannot fund a Survival deployment.');
  }
  if (!spent.charged) return;
  commanderProfile = spent.profile;
  commanderProfile = await commanderDatabase.saveProfile(commanderProfile);
}

async function refundSurvivalDeploymentV1(
  mode: GameModeV2,
  deploymentId: string,
): Promise<void> {
  if (mode !== 'survival') return;
  const refunded = refundSurvivalDeploymentCreditsV1(commanderProfile, deploymentId);
  if (!refunded.accepted) {
    throw new Error(refunded.reason ?? 'The failed Survival deployment could not be refunded.');
  }
  if (!refunded.refunded) return;
  commanderProfile = refunded.profile;
  commanderProfile = await commanderDatabase.saveProfile(commanderProfile);
}

function persistCampaignTutorialExperience(persist = true): boolean {
  const recorded = recordCampaignTutorialExperiencedV1(commanderProfile);
  if (!recorded.accepted) return false;
  commanderProfile = recorded.profile;
  // CommanderDatabase writes the local verified copy before its first await.
  if (persist) void commanderDatabase.saveProfile(commanderProfile);
  return true;
}

async function persistActiveCampaign(engine: WorldEngineV2): Promise<void> {
  if (!campaignSlot || engine !== activeEngine) return;
  let stateSave: string;
  try {
    stateSave = engine.save();
  } catch {
    return;
  }
  campaignSlot = { ...campaignSlot, stateSave, updatedAt: Date.now() };
  await commanderDatabase.saveCampaign(campaignSlot);
}

function scheduleCampaignAutosave(engine: WorldEngineV2): void {
  if (campaignAutosaveTimer !== undefined) window.clearTimeout(campaignAutosaveTimer);
  campaignAutosaveTimer = window.setTimeout(() => {
    campaignAutosaveTimer = undefined;
    void persistActiveCampaign(engine);
  }, 650);
}

function attachCampaignAutosave(engine: WorldEngineV2): void {
  unsubscribeCampaignAutosave?.();
  unsubscribeCampaignAutosave = engine.subscribe((state, change) => {
    const activeCampaign = campaignSlot;
    const warOutcome = change.warOutcome;
    if (activeCampaign && warOutcome) {
      activeCampaign.warOutcomeLedgerStartedTick ??= state.tick;
      const retained = activeCampaign.warOutcomes.filter((entry) => entry.warId !== warOutcome.warId);
      activeCampaign.warOutcomes = [...retained, {
        warId: warOutcome.warId,
        endedTick: warOutcome.endedTick,
        humanId: warOutcome.humanId,
        result: warOutcome.result,
        ownLosses: warOutcome.ownLosses,
      }].sort((left, right) => (
        left.endedTick - right.endedTick || left.warId.localeCompare(right.warId)
      ));
    }
    if (activeCampaign?.scenario.mode === 'standard-2026'
      && !commanderProfile.campaignTutorialCompleted) {
      const countryId = activeCampaign.countryId as PlayerId;
      const tutorialWasShown = state.polarEndgame.apexNarrative.players[countryId]
        ?.transmissions.some((item) => item.id === 'campaign-signal-anomaly') === true;
      const firstResearchCompleted = state.polarEndgame.arcticPrograms[countryId]
        ?.completedProjects.includes(CAMPAIGN_TUTORIAL_PROJECT_ID_V2) === true;
      if (tutorialWasShown || firstResearchCompleted) persistCampaignTutorialExperience();
    }
    if (activeCampaign?.scenario.mode === 'standard-2026'
      && warOutcome?.humanId === activeCampaign.countryId
      && warOutcome.result === 'victory'
      && engine.content.nations[warOutcome.opponentId]?.kind !== 'rogue-ai') {
      const recorded = recordCampaignDefeatedCountriesV1(
        commanderProfile,
        warOutcome.opponentId,
        activeCampaign.scenario.mode,
      );
      if (recorded.accepted) {
        commanderProfile = recorded.profile;
        activeCampaign.defeatedCountryIds = [...new Set([
          ...activeCampaign.defeatedCountryIds,
          ...recorded.newlyUnlockedCountryIds,
        ])].sort();
        void commanderDatabase.saveProfile(commanderProfile);
      }
    }
    if (activeCampaign?.scenario.mode === 'standard-2026'
      && change.reason === 'integration-complete'
      && change.victorId === activeCampaign.countryId
      && change.defeatedId
      && engine.content.nations[change.defeatedId]?.kind !== 'rogue-ai'
      && campaignCountrySignalPurgeCompleteV1(
        state,
        engine.content,
        activeCampaign.countryId as PlayerId,
        change.defeatedId,
      )) {
      activeCampaign.signalPurgedCountryIds = [...new Set([
        ...(activeCampaign.signalPurgedCountryIds ?? []),
        change.defeatedId,
      ])].sort();
    }
    scheduleCampaignAutosave(engine);
    if (campaignSlot && engine === activeEngine && (
      state.gameOver
      || !state.players[campaignSlot.countryId as PlayerId]
      || engine.territoriesOf(campaignSlot.countryId as PlayerId).length === 0
    )) void settleActiveCampaign('auto');
  });
}

async function settleActiveCampaign(
  outcome: 'auto' | 'surrender',
  storedSource?: Readonly<{
    engine: WorldEngineV2;
    campaign: StoredCampaignV1;
  }>,
): Promise<void> {
  const engine = storedSource?.engine ?? activeEngine;
  const campaign = storedSource?.campaign ?? campaignSlot;
  if (!engine || !campaign || campaignSettlementInProgress) return;
  const snapshot = createCampaignLifecycleSnapshotV1({
    source: engine,
    campaign,
    outcome,
    countryMasteryXpDifficultyMultiplier: (() => {
      const country = commanderCountryCatalog.find((entry) => entry.id === campaign.countryId);
      return country
        ? countryMasteryXpDifficultyMultiplierV1(
          country.quote.strengthRank,
          country.quote.countryCount,
        )
        : 1;
    })(),
  });
  if (!snapshot) return;
  campaignSettlementInProgress = true;
  engine.stopClock();
  const masteryBeforeSettlement = countryMasteryV1(commanderProfile, campaign.countryId);
  const commanderBeforeSettlement = {
    xp: commanderProfile.commanderXp,
    level: commanderProfile.commanderLevel,
    talentPointsAvailable: commanderTalentPointsAvailableV1(commanderProfile),
  };
  const tutorialRecorded = campaign.scenario.mode === 'standard-2026'
    ? persistCampaignTutorialExperience(false)
    : false;
  const claimed = snapshot.rewardEligible
    ? claimCampaignRewardV1(commanderProfile, snapshot.reward)
    : { accepted: false, profile: commanderProfile, reason: 'This mode has no account progression.' };
  const progressionTutorial = queueCampaignProgressionTutorialV1(
    claimed.accepted ? claimed.profile : commanderProfile,
    campaign.scenario.mode,
  );
  const settledProfile = progressionTutorial.accepted
    ? progressionTutorial.profile : claimed.accepted ? claimed.profile : commanderProfile;
  try {
    if (claimed.accepted || progressionTutorial.accepted) {
      commanderProfile = await commanderDatabase.saveProfile(settledProfile);
    } else if (tutorialRecorded) {
      commanderProfile = await commanderDatabase.saveProfile(commanderProfile);
    }
    await commanderDatabase.clearCampaign();
    campaignSlot = undefined;
    const countryDefinition = engine.content.nations[campaign.countryId as PlayerId];
    commanderMenu?.destroy();
    commanderMenu = undefined;
    destroyActiveGame();
    campaignReport?.destroy();
    campaignReport = new CampaignReportV1({
      snapshot,
      country: {
        name: countryDefinition?.name ?? campaign.countryId.toUpperCase(),
        shortName: countryDefinition?.shortName,
        sigil: countryDefinition?.sigil,
        cssColor: countryDefinition?.cssColor,
      },
      flagCountryId: commanderProfile.empireFlag.countryId,
      masteryBeforeSettlement,
      commanderBeforeSettlement,
      unlockedCountries: campaign.defeatedCountryIds
        .map((countryId) => commanderCountryCatalog.find((country) => country.id === countryId))
        .filter((country): country is CommanderCountryCatalogEntryV1 => Boolean(country))
        .map((country) => ({
          countryId: country.id,
          name: country.name,
        })),
      onReturnToMainMenu: () => {
        campaignReport?.destroy();
        campaignReport = undefined;
        showCommanderMenu();
      },
    });
  } catch (error) {
    campaignSettlementInProgress = false;
    engine.setSpeed(0);
    console.error('Campaign settlement could not be saved.', error);
    return;
  }
  campaignSettlementInProgress = false;
}

function surrenderStoredCampaign(): void {
  const campaign = campaignSlot;
  if (!campaign || campaignSettlementInProgress) return;
  try {
    const resolved = resolveScenarioV2(campaign.scenario);
    registerStoredCampaignMasteryRuntime(resolved.content, campaign);
    const engine = WorldEngineV2.fromSave(campaign.stateSave, resolved.content);
    void settleActiveCampaign('surrender', { engine, campaign });
  } catch (error) {
    console.error('The stored campaign could not be settled.', error);
  }
}

function applyCountryLoadoutAtCampaignStart(
  engine: WorldEngineV2,
  countryId: PlayerId,
  loadout: ResolvedCountryLoadoutV1,
  applyEmpireIdentity: boolean,
): void {
  const nation = engine.state.players[countryId];
  if (!nation) return;
  registerCountryMasteryRuntimeV2(
    engine.content,
    countryId,
    loadout.masteryMilitary,
  );
  if (applyEmpireIdentity) nation.empireName = commanderProfile.empireName;
  const levels = loadout.upgrades;
  const effects = nation.research.effectLevels;
  effects.training += levels.mobilization;
  effects['force-capacity'] += levels.mobilization;
  effects['reserve-training'] += levels.mobilization;
  effects.supply += levels.logistics;
  effects['operating-efficiency'] += levels.logistics;
  effects['research-speed'] += levels.research;
  effects['research-efficiency'] += levels.research;
  effects['economy-growth'] += levels.economy;
  effects['tax-efficiency'] += levels.economy;
  nation.treasury *= loadout.openingEconomyMultiplier;
  nation.trainedReserves *= (1 + levels.mobilization * 0.025)
    * loadout.masteryMilitary.armyCapacityMultiplier;
  for (const territory of Object.values(engine.state.territories)) {
    if (territory.owner !== countryId) continue;
    territory.army.manpower *= loadout.openingArmyMultiplier
      * loadout.masteryMilitary.armyCapacityMultiplier;
    territory.economy *= loadout.openingEconomyMultiplier;
  }
}

function registerStoredCampaignMasteryRuntime(
  content: ReturnType<typeof resolveScenarioV2>['content'],
  campaign: StoredCampaignV1,
): void {
  resetCountryMasteryRuntimeV2(content);
  const rosterCountryIds = campaign.scenario.mode === 'survival'
    ? [...new Set(commanderProfile.unlockedCountryIds)]
    : [campaign.countryId];
  for (const countryId of rosterCountryIds) {
    if (!content.nations[countryId as PlayerId]) continue;
    registerCountryMasteryRuntimeV2(
      content,
      countryId,
      countryId === campaign.countryId
        ? campaign.loadout.masteryMilitary
        : resolveCountryLoadoutV1(commanderProfile, countryId).masteryMilitary,
    );
  }
}

async function beginStoredCampaign(engine: WorldEngineV2, countryId: PlayerId): Promise<boolean> {
  if (!commanderProfile.unlockedCountryIds.includes(countryId)) return false;
  const now = Date.now();
  const loadout = resolveCountryLoadoutV1(commanderProfile, countryId);
  const scenario = scenarioConfigFromEngineV2(engine);
  if (scenario.mode === 'standard-2026' && commanderProfile.campaignTutorialCompleted) {
    initializeExperiencedCampaignV2(engine.state, engine.content, countryId);
  }
  resetCountryMasteryRuntimeV2(engine.content);
  const commanderInitialized = engine.initializeCommanderForce(
    countryId,
    resolveCommanderForceInitializationV1(loadout),
  );
  if (!commanderInitialized.accepted) {
    console.error('The APEX neural shield could not be initialized.', commanderInitialized.reason);
    return false;
  }
  const rosterCountryIds = scenario.mode === 'survival'
    ? [...new Set(commanderProfile.unlockedCountryIds)]
      .map((id) => id as PlayerId)
      .filter((id) => Boolean(engine.state.players[id]))
      .sort((left, right) => left.localeCompare(right))
    : [countryId];
  for (const rosterCountryId of rosterCountryIds) {
    applyCountryLoadoutAtCampaignStart(
      engine,
      rosterCountryId,
      rosterCountryId === countryId
        ? loadout : resolveCountryLoadoutV1(commanderProfile, rosterCountryId),
      rosterCountryId === countryId,
    );
  }
  synchronizeArmyCapacityV2(engine.state, engine.content);
  if (scenario.mode === 'survival') {
    const formed = engine.formSurvivalEmpire(countryId, commanderProfile.unlockedCountryIds);
    if (!formed.accepted) {
      console.error('The unlocked-country Survival empire could not be formed.', formed.reason);
      return false;
    }
    const acknowledged = acknowledgePolarWarningV2(engine.state, countryId);
    if (!acknowledged.accepted) {
      console.error('The initial Survival warning could not be acknowledged.', acknowledged.reason);
      return false;
    }
  }
  const newCampaignId = campaignId();
  let newCampaign: StoredCampaignV1;
  try {
    await chargeSurvivalDeploymentV1(scenario.mode, newCampaignId);
    newCampaign = {
      schemaVersion: 1,
      campaignId: newCampaignId,
      scenario,
      countryId,
      defeatedCountryIds: [],
      signalPurgedCountryIds: [],
      warOutcomes: [],
      warOutcomeLedgerStartedTick: engine.state.tick,
      profileRevisionAtStart: commanderProfile.revision,
      loadout,
      rewardEligible: scenario.mode !== 'random-world',
      stateSave: engine.save(),
      baseline: {
        startingTerritoryIds: engine.territoriesOf(countryId).map((territory) => territory.id),
        startingMilitaryLosses: 0,
        startingTick: engine.state.tick,
      },
      startedAt: now,
      updatedAt: now,
    };
    await commanderDatabase.saveCampaign(newCampaign);
  } catch (error) {
    try {
      await refundSurvivalDeploymentV1(scenario.mode, newCampaignId);
    } catch (refundError) {
      console.error('The failed Survival deployment refund could not be persisted.', refundError);
    }
    console.error('The campaign deployment could not be committed.', error);
    return false;
  }
  campaignSlot = newCampaign;
  attachCampaignAutosave(engine);
  return true;
}

function persistProfileResult(result: ReturnType<typeof renameCommanderV1>) {
  if (result.accepted) {
    commanderProfile = result.profile;
    void commanderDatabase.saveProfile(commanderProfile);
  }
  return result;
}

function countryLoadoutPresentation() {
  return new Map(commanderCountryCatalog.map((country) => {
    const loadout = resolveCountryLoadoutV1(commanderProfile, country.id);
    const deployedArmyMultiplier = loadout.openingArmyMultiplier
      * loadout.masteryMilitary.armyCapacityMultiplier;
    const baseQuality = 0.55 * country.opening.attack + 0.45 * country.opening.defense;
    const masteredQuality = 0.55 * country.opening.attack
      * loadout.masteryMilitary.attackMultiplier
      + 0.45 * country.opening.defense * loadout.masteryMilitary.defenseMultiplier;
    const qualityMultiplier = baseQuality > 0 ? masteredQuality / baseQuality : 1;
    return [country.id, {
      openingArmyMultiplier: deployedArmyMultiplier,
      openingEconomyMultiplier: loadout.openingEconomyMultiplier,
      trainedReserveMultiplier: (1 + loadout.upgrades.mobilization * 0.025)
        * loadout.masteryMilitary.armyCapacityMultiplier,
      traitScale: loadout.traitScale,
      attackMultiplier: loadout.masteryMilitary.attackMultiplier,
      defenseMultiplier: loadout.masteryMilitary.defenseMultiplier,
      combatPowerMultiplier: deployedArmyMultiplier * qualityMultiplier,
    }] as const;
  }));
}

async function resetCommanderAccount(): Promise<void> {
  destroyActiveGame();
  await commanderDatabase.clearCampaign();
  campaignSlot = undefined;
  const fresh = createCommanderProfileV1();
  const starters = grantStarterCountriesV1(
    fresh,
    commanderCountryCatalog
      .filter((country) => country.quote.starterEligible)
      .map((country) => country.id),
  );
  commanderProfile = await commanderDatabase.saveProfile(starters.profile);
  showCommanderMenu();
}

function showCommanderMenu(keepStartupLoader = false): void {
  if (activeEngine && campaignSlot) void persistActiveCampaign(activeEngine);
  commanderMenu?.destroy();
  commanderMenu = undefined;
  campaignReport?.destroy();
  campaignReport = undefined;
  destroyActiveGame();
  if (!keepStartupLoader) dismissStartupLoader();
  commanderMenu = new CommanderMenuV1({
    profile: commanderProfile,
    countries: commanderCountryCatalog,
    campaign: campaignSlot,
    multiplayerResume: activeGuestReconnectSession ? {
      countryId: activeGuestReconnectSession.countryId,
      mode: activeGuestReconnectSession.scenario.mode,
      expiresAt: activeGuestReconnectSession.expiresAt,
    } : undefined,
    onStartMode: (mode, countryId, replaceExistingCampaign) => {
      void launchSoloScenarioForCountry(
        { mode, seed: randomSeed() },
        countryId as PlayerId,
        replaceExistingCampaign,
      );
    },
    onMultiplayerRequested: (mode, countryId) => openMultiplayerLobby(
      countryId as PlayerId,
      mode,
    ),
    onContinueCampaign: continueStoredCampaign,
    onSurrenderCampaign: surrenderStoredCampaign,
    onResumeMultiplayer: resumeStoredGuestMatch,
    onDiscardMultiplayerResume: () => {
      destroyActiveGame();
      clearActiveGuestReconnectSession();
    },
    onDeleteCampaign: () => {
      campaignSlot = undefined;
      void commanderDatabase.clearCampaign();
    },
    onResetAccount: () => { void resetCommanderAccount(); },
    onAcknowledgeCampaignProgressionTutorial: () => persistProfileResult(
      acknowledgeCampaignProgressionTutorialV1(commanderProfile),
    ),
    onAllocateCountryMasteryPoint: (countryId, track: CountryMasteryTrackV1) => (
      persistProfileResult(allocateCountryMasteryPointV1(
        commanderProfile,
        countryId,
        track,
      ))
    ),
    onRespecCountryMastery: (countryId) => persistProfileResult(
      respecCountryMasteryV1(commanderProfile, countryId),
    ),
    onAllocateCommanderTalent: (talentId) => persistProfileResult(
      allocateCommanderTalentV1(commanderProfile, talentId),
    ),
    onSelectCommanderDoctrine: (doctrine) => persistProfileResult(
      selectCommanderDoctrineV1(commanderProfile, doctrine),
    ),
    onRespecCommanderTalents: () => persistProfileResult(
      respecCommanderTalentsV1(commanderProfile),
    ),
    onRenameCommander: (name) => persistProfileResult(renameCommanderV1(commanderProfile, name)),
    onRenameEmpire: (name) => persistProfileResult(renameEmpireV1(commanderProfile, name)),
    onSelectEmpireFlag: (flag) => persistProfileResult(selectEmpireFlagV1(
      commanderProfile,
      flag,
      commanderCountryCatalog.map((country) => country.id),
    )),
  });
}

function continueStoredCampaign(): void {
  if (!campaignSlot) return;
  try {
    showDeploymentLoader(campaignSlot.countryId as PlayerId, campaignSlot.scenario);
    const resolved = resolveScenarioV2(campaignSlot.scenario);
    registerStoredCampaignMasteryRuntime(resolved.content, campaignSlot);
    const engine = WorldEngineV2.fromSave(campaignSlot.stateSave, resolved.content);
    if (campaignSlot.warOutcomeLedgerStartedTick === undefined) {
      campaignSlot = {
        ...campaignSlot,
        warOutcomeLedgerStartedTick: engine.state.tick,
        updatedAt: Date.now(),
      };
      void commanderDatabase.saveCampaign(campaignSlot);
    }
    commanderMenu?.destroy();
    commanderMenu = undefined;
    destroyActiveGame();
    setDeploymentLoaderStage('map');
    activeScenario = resolved.config;
    publishScenarioToLocation(activeScenario);
    mountWorldUi(engine, false, activeControllerNames, campaignSlot.countryId as PlayerId, false);
    attachCampaignAutosave(engine);
    engine.resumeClock();
    void dismissStartupLoaderAfterMapFrame();
  } catch {
    campaignSlot = undefined;
    void commanderDatabase.clearCampaign();
    showCommanderMenu();
  }
}

function mountWorldUi(
  engine: WorldEngineV2,
  multiplayer: boolean,
  controllerNames: ReadonlyMap<PlayerId, string> = activeControllerNames,
  initialPreviewCountryId?: PlayerId,
  introOpen = true,
): void {
  if (activeEngine && activeEngine !== engine) activeEngine.stopClock();
  activeUi?.destroy();
  activeEngine = engine;
  const empireFlagCountryIds = multiplayer
    ? activeEmpireFlagCountryIds
    : new Map<PlayerId, string>(engine.state.humanPlayerIds.map((playerId) => [
      playerId,
      commanderProfile.empireFlag.countryId,
    ]));
  activeUi = new WorldUIV2(engine, multiplayer
    ? {
      introOpen: false,
      multiplayer: true,
      controllerNames,
      empireFlagCountryIds,
      // Viewer-local dossiers may differ between peers and never enter the
      // authoritative multiplayer snapshot.
      availableCountryIds: new Set(commanderProfile.unlockedCountryIds as PlayerId[]),
    }
    : {
      introOpen,
      initialPreviewCountryId,
      empireFlagCountryIds,
      availableCountryIds: new Set(commanderProfile.unlockedCountryIds as PlayerId[]),
      countryMasteryLevels: new Map(commanderProfile.unlockedCountryIds.map((countryId) => [
        countryId as PlayerId,
        countryMasteryV1(commanderProfile, countryId).level,
      ])),
      countryLoadouts: countryLoadoutPresentation(),
      onOpenNationArsenal: (countryId) => {
        showCommanderMenu();
        commanderMenu?.openArsenal(countryId);
      },
      onCountryConfirmed: (countryId) => {
        showDeploymentLoader(countryId, scenarioConfigFromEngineV2(engine));
        void beginStoredCampaign(engine, countryId);
      },
      onInitialMapSynchronized: () => { void dismissStartupLoaderAfterMapFrame(); },
      onSurrenderRequested: () => { void settleActiveCampaign('surrender'); },
      onMultiplayerRequested: openMultiplayerLobby,
      scenarioConfig: scenarioConfigFromEngineV2(engine),
      onScenarioModeRequested: (mode) => launchSoloScenario({ mode, seed: randomSeed() }),
      onScenarioRerollRequested: (preferredCountryId) => launchSoloScenario({
        mode: activeScenario.mode,
        seed: randomSeed(),
      }, preferredCountryId),
      onNewGameRequested: () => {
        if (campaignSlot && activeEngine) void settleActiveCampaign('auto');
        else showCommanderMenu();
      },
    });
}

function launchSoloScenario(
  input: Pick<ScenarioConfigV2, 'mode' | 'seed'>,
  preferredCountryId?: PlayerId,
): void {
  if (activeLobby || activeSession) return;
  const resolved = resolveScenarioV2(input);
  commanderMenu?.destroy();
  commanderMenu = undefined;
  destroyActiveGame();
  activeScenario = resolved.config;
  publishScenarioToLocation(activeScenario);
  const engine = new WorldEngineV2(activeScenario.seed, resolved.content);
  mountWorldUi(engine, false, activeControllerNames, preferredCountryId);
  engine.startClock();
}

/**
 * Nation-first solo launch. The selected flagship is made canonical before any
 * playable UI mounts, then its frozen country/Commander meta loadout is saved.
 * This deliberately bypasses the legacy second nation picker.
 */
async function launchSoloScenarioForCountry(
  input: Pick<ScenarioConfigV2, 'mode' | 'seed'>,
  countryId: PlayerId,
  replaceExistingCampaign = false,
): Promise<void> {
  if (activeLobby || activeSession) return;
  if (campaignSlot && !replaceExistingCampaign) {
    showCommanderMenu();
    return;
  }
  if (!commanderProfile.unlockedCountryIds.includes(countryId)) {
    showCommanderMenu();
    commanderMenu?.openArsenal(countryId);
    return;
  }
  const resolved = resolveScenarioV2(input);
  commanderMenu?.destroy();
  commanderMenu = undefined;
  destroyActiveGame();
  showDeploymentLoader(countryId, resolved.config);
  activeScenario = resolved.config;
  publishScenarioToLocation(activeScenario);
  const engine = new WorldEngineV2(activeScenario.seed, resolved.content);
  const selection = engine.chooseCountry(countryId);
  if (!selection.accepted) {
    engine.stopClock();
    dismissStartupLoader();
    showCommanderMenu();
    return;
  }
  const initialized = await beginStoredCampaign(engine, countryId);
  if (!initialized) {
    engine.stopClock();
    dismissStartupLoader();
    showCommanderMenu();
    return;
  }
  setDeploymentLoaderStage('map');
  mountWorldUi(engine, false, activeControllerNames, countryId, false);
  engine.startClock();
  void focusInitialFlagshipAfterMapReady(countryId);
  void dismissStartupLoaderAfterMapFrame();
}

function attachHostStatus(session: HostGameSession): void {
  activeSessionStatus = new MultiplayerSessionStatus();
  unsubscribeSessionStatus = session.subscribe({
    onStatus: (status) => activeSessionStatus?.update(status),
  });
}

function attachGuestStatus(
  session: GuestGameSession,
  reconnect: GuestReconnectCoordinator,
): void {
  unsubscribeSessionStatus?.();
  activeSessionStatus?.destroy();
  activeSessionStatus = new MultiplayerSessionStatus({
    onReconnect: () => reconnect.reconnect(),
  });
  unsubscribeSessionStatus = session.subscribe({
    onStatus: (status) => {
      activeSessionStatus?.update(status);
      if (session.engine?.state.gameOver) clearActiveGuestReconnectSession();
      else refreshActiveGuestReconnectSession();
    },
    onCommandResult: (event) => activeSessionStatus?.showCommandResult(event),
    onSnapshot: ({ engine }) => {
      if (activeSession !== session) return;
      const worldEngine = worldEngineFromSession(engine);
      commanderMenu?.destroy();
      commanderMenu = undefined;
      activeScenario = scenarioConfigFromEngineV2(worldEngine);
      publishScenarioToLocation(activeScenario);
      mountWorldUi(worldEngine, true, activeControllerNames);
      refreshActiveGuestReconnectSession(true);
    },
  });
}

async function launchHostGame(launch: MultiplayerHostLaunch): Promise<void> {
  const seats = multiplayerSeatsFromLobby(launch.lobby);
  const deployments = multiplayerDeploymentsFromLobby(launch.lobby);
  const controllerNames = multiplayerControllerNamesFromLobby(launch.lobby);
  const hostCountryId = localCountryFromLobby(launch.lobby, launch.transport.hostPeerId);
  if (!sameScenario(launch.scenario, launch.lobby.scenario)) {
    throw new Error('The host launch scenario no longer matches the lobby.');
  }
  const scenario = resolveScenarioV2(launch.scenario);
  const engine = new WorldEngineV2(scenario.config.seed, scenario.content);
  const countrySelection = engine.chooseCountry(hostCountryId);
  engine.setClockAuthority(false);
  if (!countrySelection.accepted) {
    engine.stopClock();
    throw new Error(countrySelection.reason ?? 'The host country could not be selected.');
  }
  const session = new HostGameSession({ engine, transport: launch.transport, seats });
  if (session.hostCountryId !== hostCountryId) {
    session.close(false);
    throw new Error('The host lobby seat changed during campaign launch.');
  }
  const deployed = applyMultiplayerDeploymentsV1(engine, deployments);
  if (!deployed.accepted) {
    session.close(false);
    throw new Error(deployed.reason ?? 'The co-op deployments could not be initialized.');
  }
  const deploymentId = `coop:${launch.transport.roomId}:${launch.transport.hostPeerId}`;
  try {
    await chargeSurvivalDeploymentV1(scenario.config.mode, deploymentId);
    const started = session.start();
    if (!started.accepted) {
      throw new Error(started.reason ?? 'The host session could not start.');
    }
  } catch (error) {
    session.close(false);
    try {
      await refundSurvivalDeploymentV1(scenario.config.mode, deploymentId);
    } catch (refundError) {
      console.error('The failed co-op Survival deployment refund could not be persisted.', refundError);
    }
    throw error;
  }

  activeLobby?.destroy(false);
  activeLobby = undefined;
  commanderMenu?.destroy();
  commanderMenu = undefined;
  destroyActiveGame();
  activeScenario = scenario.config;
  publishScenarioToLocation(activeScenario);
  activeControllerNames = controllerNames;
  activeEmpireFlagCountryIds = new Map([...deployments].map(([seatId, deployment]) => [
    seatId,
    deployment.empireFlag.countryId,
  ]));
  activeSession = session;
  activeHostReconnect = new HostReconnectCoordinator({
    transport: launch.transport,
    seatPeerIds: new Set([...seats.keys()].filter((peerId) => peerId !== launch.transport.hostPeerId)),
    onStatus: (status) => activeSessionStatus?.showReconnectStatus(status),
  });
  mountWorldUi(engine, true, controllerNames);
  attachHostStatus(session);
}

async function launchGuestGame(launch: MultiplayerGuestLaunch): Promise<void> {
  const seats = multiplayerSeatsFromLobby(launch.lobby);
  const deployments = multiplayerDeploymentsFromLobby(launch.lobby);
  const controllerNames = multiplayerControllerNamesFromLobby(launch.lobby);
  const countryId = localCountryFromLobby(launch.lobby, launch.transport.peerId);
  if (!sameScenario(launch.scenario, launch.lobby.scenario)) {
    throw new Error('The guest launch scenario no longer matches the lobby.');
  }
  const scenario = resolveScenarioV2(launch.scenario);
  const session = new GuestGameSession({
    transport: launch.transport,
    countryId,
    seatCount: seats.size,
    humanPlayerIds: [...seats.values()],
    content: scenario.content,
  });
  registerMultiplayerDeploymentRuntimeV1(scenario.content, deployments);
  const accepted = session.acceptSnapshot(launch.snapshot);
  if (!accepted.accepted || !session.engine) {
    session.close(false);
    throw new Error(accepted.reason ?? 'The host snapshot could not be loaded.');
  }
  const engine = worldEngineFromSession(session.engine);
  const snapshotScenario = scenarioConfigFromEngineV2(engine);
  if (!sameScenario(snapshotScenario, scenario.config)) {
    session.close(false);
    throw new Error('The host snapshot does not match the lobby game mode and seed.');
  }
  try {
    await chargeSurvivalDeploymentV1(
      scenario.config.mode,
      `coop:${launch.transport.roomId}:${launch.transport.peerId}`,
    );
  } catch (error) {
    session.close(false);
    throw error;
  }

  activeLobby?.destroy(false);
  activeLobby = undefined;
  commanderMenu?.destroy();
  commanderMenu = undefined;
  destroyActiveGame();
  activeScenario = scenario.config;
  publishScenarioToLocation(activeScenario);
  activeControllerNames = controllerNames;
  activeEmpireFlagCountryIds = new Map([...deployments].map(([seatId, deployment]) => [
    seatId,
    deployment.empireFlag.countryId,
  ]));
  activeSession = session;
  const reconnectCredential = launch.transport.reconnectCredential;
  if (reconnectCredential) {
    activeGuestReconnectSession = refreshGuestReconnectSessionV1(window.sessionStorage, {
      schemaVersion: 1,
      roomId: launch.transport.roomId,
      rulesVersion: launch.transport.rulesVersion,
      displayName: launch.transport.displayName,
      credential: reconnectCredential,
      scenario: scenario.config,
      countryId,
      seatCount: seats.size,
      humanPlayerIds: [...seats.values()],
      controllerNames: [...controllerNames.entries()],
      deployments: [...deployments.values()],
      expiresAt: Date.now() + 1,
    });
    lastGuestReconnectRefreshAt = Date.now();
  }
  const reconnect = new GuestReconnectCoordinator({
    transport: launch.transport,
    attachTransport: (transport) => {
      const replaced = session.replaceTransport(transport);
      if (!replaced.accepted) {
        transport.close();
        activeSessionStatus?.showReconnectStatus({
          peerId: launch.transport.peerId,
          phase: 'error',
          message: replaced.reason ?? 'The restored route did not match this campaign.',
        });
      }
    },
    onStatus: (status) => activeSessionStatus?.showReconnectStatus(status),
  });
  activeGuestReconnect = reconnect;
  mountWorldUi(engine, true, controllerNames);
  attachGuestStatus(session, reconnect);
}

/**
 * Rebuilds only the guest's signaling route after an accidental reload. The
 * authoritative game replica is deliberately not persisted: the host sends a
 * fresh snapshot before the world UI is remounted.
 */
function resumeStoredGuestMatch(): void {
  if (activeGuestReconnect || activeSession || activeLobby) return;
  const stored = loadGuestReconnectSessionV1(window.sessionStorage);
  if (!stored || stored.rulesVersion !== V2_RULES_VERSION) {
    clearActiveGuestReconnectSession();
    showCommanderMenu();
    return;
  }

  let scenario: ReturnType<typeof resolveScenarioV2>;
  try {
    scenario = resolveScenarioV2(stored.scenario);
  } catch {
    clearActiveGuestReconnectSession();
    showCommanderMenu();
    return;
  }
  const countryId = stored.countryId as PlayerId;
  const humanPlayerIds = stored.humanPlayerIds.map((id) => id as PlayerId);
  const deployments = new Map(stored.deployments.map((deployment) => [
    deployment.countryId,
    deployment,
  ] as const));
  activeEmpireFlagCountryIds = new Map([...deployments].map(([seatId, deployment]) => [
    seatId,
    deployment.empireFlag.countryId,
  ]));
  const controllerNames = new Map(stored.controllerNames.map(([id, name]) => [
    id as PlayerId,
    name,
  ] as const));
  const storedIdentity: GuestReconnectTransportIdentity = {
    roomId: stored.roomId,
    rulesVersion: stored.rulesVersion,
    displayName: stored.displayName,
    reconnectCredential: stored.credential,
    close: () => {},
  };
  registerMultiplayerDeploymentRuntimeV1(scenario.content, deployments);
  let session: GuestGameSession | undefined;
  let reconnect!: GuestReconnectCoordinator;
  reconnect = new GuestReconnectCoordinator({
    transport: storedIdentity,
    attachTransport: (transport) => {
      if (!session) {
        session = new GuestGameSession({
          transport,
          countryId,
          seatCount: stored.seatCount,
          humanPlayerIds,
          content: scenario.content,
        });
        activeScenario = scenario.config;
        activeControllerNames = controllerNames;
        activeSession = session;
        attachGuestStatus(session, reconnect);
        return;
      }
      const replaced = session.replaceTransport(transport);
      if (!replaced.accepted) {
        transport.close();
        activeSessionStatus?.showReconnectStatus({
          peerId: stored.credential.peerId,
          phase: 'error',
          message: replaced.reason ?? 'The restored route did not match this campaign.',
        });
      }
    },
    onStatus: (status) => {
      activeSessionStatus?.showReconnectStatus(status);
      if ((status.phase === 'expired' || status.phase === 'error')
        && Date.now() >= stored.expiresAt) {
        clearActiveGuestReconnectSession();
        reconnect.destroy();
        if (!activeSession) {
          activeGuestReconnect = undefined;
          showCommanderMenu();
        }
      }
    },
  });
  activeGuestReconnect = reconnect;
  activeControllerNames = controllerNames;
  activeSessionStatus?.destroy();
  activeSessionStatus = new MultiplayerSessionStatus({
    onReconnect: () => reconnect.reconnect(),
  });
  activeSessionStatus.showReconnectStatus({
    peerId: stored.credential.peerId,
    phase: 'waiting',
    message: 'Your country and mission are reserved. Finding the host…',
  });
  reconnect.reconnect();
}

function openMultiplayerLobby(
  preferredCountryId?: PlayerId,
  requestedMode?: GameModeV2,
): void {
  if (activeLobby || activeSession) return;
  const liveEngine = activeEngine;
  const pausedEngine = liveEngine ?? (() => {
    const scenario = resolveScenarioV2(requestedMode
      ? { mode: requestedMode, seed: randomSeed() }
      : activeScenario);
    return new WorldEngineV2(scenario.config.seed, scenario.content);
  })();
  const previousSpeed = liveEngine?.state.speed;
  liveEngine?.setSpeed(0);
  const lobby = new MultiplayerLobby({
    onClose: () => {
      if (activeLobby !== lobby) return;
      activeLobby = undefined;
      if (liveEngine && !activeSession && activeEngine === liveEngine && previousSpeed !== undefined) {
        liveEngine.setSpeed(previousSpeed);
      }
    },
    onHostLaunch: launchHostGame,
    onGuestLaunch: launchGuestGame,
    openingMetrics: new IntroOpeningMetricsCacheV2().read(pausedEngine),
    scenarioConfig: scenarioConfigFromEngineV2(pausedEngine),
    preferredCountryId,
    availableCountryIds: new Set(commanderProfile.unlockedCountryIds),
    countryMasteryLevels: new Map(commanderProfile.unlockedCountryIds.map((countryId) => [
      countryId,
      countryMasteryV1(commanderProfile, countryId).level,
    ])),
    deploymentSnapshots: new Map(commanderProfile.unlockedCountryIds.map((countryId) => [
      countryId,
      createMultiplayerDeploymentSnapshotV1(commanderProfile, countryId),
    ])),
    directMatchmaking: preferredCountryId !== undefined && requestedMode !== undefined,
  });
  activeLobby = lobby;
}

async function bootstrapCommanderExperience(): Promise<void> {
  try {
    [commanderProfile, campaignSlot] = await Promise.all([
      commanderDatabase.loadProfile(),
      commanderDatabase.loadCampaign(),
    ]);
  } catch {
    commanderProfile = createCommanderProfileV1();
    campaignSlot = undefined;
  }
  commanderCountryCatalog = buildCommanderCountryCatalog();
  const starters = grantStarterCountriesV1(
    commanderProfile,
    commanderCountryCatalog
      .filter((country) => country.quote.starterEligible)
      .map((country) => country.id),
  );
  if (starters.accepted) {
    commanderProfile = await commanderDatabase.saveProfile(starters.profile);
  }
  if (campaignSlot && storedCampaignWasPlayedV1(campaignSlot)
    && !commanderProfile.campaignTutorialCompleted
    && persistCampaignTutorialExperience(false)) {
    commanderProfile = await commanderDatabase.saveProfile(commanderProfile);
  }
  activeGuestReconnectSession = loadGuestReconnectSessionV1(window.sessionStorage);
  if (activeGuestReconnectSession?.rulesVersion !== V2_RULES_VERSION) {
    clearActiveGuestReconnectSession();
  }
  showCommanderMenu(true);
  await dismissBootLoaderAfterReady();
}

void bootstrapCommanderExperience();

void worldMapRenderer.catch((error: unknown) => {
  dismissStartupLoader();
  window.setTimeout(() => { throw error; });
});

window.addEventListener('beforeunload', () => {
  pageUnloading = true;
  refreshActiveGuestReconnectSession(true);
  if (activeEngine && campaignSlot) {
    try {
      campaignSlot = { ...campaignSlot, stateSave: activeEngine.save(), updatedAt: Date.now() };
      saveCampaignSlotV1(window.localStorage, campaignSlot);
    } catch {
      // Regular IndexedDB autosaves remain intact when the small backup is full.
    }
  }
  activeLobby?.destroy();
  activeLobby = undefined;
  destroyActiveGame();
}, { once: true });
